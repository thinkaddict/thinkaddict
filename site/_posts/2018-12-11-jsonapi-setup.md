---
title: JSONAPI Setup
headline: 'JSON:API Setup'
cover_image: >-
  https://images.unsplash.com/photo-1539249168139-1d59c9926613?ixlib=rb-0.3.5&ixid=eyJhcHBfaWQiOjM2MzQ1fQ&s=b923370fdf68c952d4673030952b766d&auto=format&fit=crop&w=500&q=80&h=280&crop=entropy
date: 2018-12-11 00:00:00 -0800
tags:
  - testing
  - jsonapi
  - elixir
prerequisite_posts:
  - 2018-12-04-getting-started
published: true
---

## Overview

JSON:API is a standard for REST API’s. The cool kids are using GraphQL these days, and, it’s definitely something worth looking into, later.

For now, our goal is to build an api that works on convention out of the box. I don’t want to have to shave any yaks or paint any bike sheds. I’m too old, I’d rather stand on the shoulders of giants who have already figured this shit out.

Whether its JSON:API of GraphQL,  the purpose is to separate our business logic from our presentation. We want to future proof our application, this way we can easily build a mobile, tv, car, or refrigerator application with the same API that we are using for our web application.

## JaSerializer

Phoenix out of the box is a traditional web server that renders html. Luckily, you can configure it to render JSON instead using the –no-html flag when you `mix phx.new`.

The problem is, it’s raw JSON, no convention or standard. We’re going to tame this beast using JaSerializer.

```elixir
# mix.exs
defp deps do
  [
    # ...
    {:ja_serializer, "~> 0.13"}
  ]
end
```

After updating our `mix.exs` we need to install our dependencies `docker-compose run --rm server mix deps.get`. If you’re wondering where `docker-compose` came from, check out the [getting started](/articles/getting-started/) article.

With JaSerializer installed, we need to tell Phoenix to listen and respond to JSON:API vis the `application/vnd.api+json` request header in stead of the standard `application/json`.

```elixir
# config/config.exs
config :get_social, GetSocialWeb.Endpoint,
  # ...
  render_errors: [view: GetSocialWeb.ErrorView, accepts: ~w(json json-api)]
  # ...

config :mime, :types, %{
  "application/vnd.api+json" => ["json-api"]
}

config :phoenix, :format_encoders, "json-api": Jason
```

Since we changed out `mime` config, we need to rebuild Phoenix with `docker-compose run --rm server mix deps.clean mime --build`

Finally, we can restart our server `docker-compose restart server`.

## Request Deserialization

Now we need to configure Phoenix to send/receive the JSON:API payload. To do this, we will create a new plug `server/src/lib/get_social_web/plugs/json_api.ex`:

```elixir
# server/src/lib/get_social_web/plugs/json_api.ex
defmodule GetSocialWeb.Plugs.JSONAPI do
  use Plug.Builder

  alias Plug.Conn

  plug JaSerializer.ContentTypeNegotiation
  plug JaSerializer.Deserializer
  plug :data_to_attributes

  @spec data_to_attributes(Conn, map) :: map
  defp data_to_attributes(%Conn{params: %{} = params} = conn, _opts) do
    params = params
      |> Map.put("data", parse_data(params))

    conn
    |> Map.put(:params, params)
  end

  @spec parse_data(map) :: map
  defp parse_data(%{"data" => data}), do: data |> JaSerializer.Params.to_attributes
  defp parse_data(%{}), do: %{}
end
```

This new plug adds the `JaSerializer.ContentTypeNegotiation` and `JaSerializer.Deserializer` plugs to normalize the incoming JSON:API payload by converting dasherized keys to underscored keys. This will also handle converting the JSON:API payload to an easier to use attributes map.

For instance:

```json
{
  "data": {
    "attributes": {
      "about_me": "test",
      "display_name": "test",
      "status": "test",
      "username": "test"
    },
    "relationships": {
      "assets": {
        "data": [
          {
            "id": "90ea2e25-6166-40db-8991-bfe043741d3f",
            "type": "assets"
          }
        ]
      }
    },
    "type": "profiles"
  }
}
```

to

```json
{
  "data": {
    "about_me": "test",
    "assets_ids": [
      "90ea2e25-6166-40db-8991-bfe043741d3f"
    ],
    "display_name": "test",
    "id": null,
    "status": "test",
    "type": "profiles",
    "username": "test"
  }
}
```

Without this new plug, we would have expand our controller actions to match the nested JSON:API format. This also add additional complexity when dealing with relationships.

```elixir
defmodule Web.Controller do
  use Web, :controller

  def create(conn, %{ "data" => data = %{ "type" => "asset", "attributes" => asset_params } }) do
    # ...
  end
end
```

Instead, we can just match on “data”:

```elixir
defmodule Web.Controller do
  use Web, :controller

  def create(conn, %{ "data" => asset_params }) do
    # ...
  end
end
```

We now need to add the new `GetSocialWeb.Plugs.JSONAPI` plug to our `router.ex` and change our `:accepts` to `json-api`.

```elixir
# lib/get_social_web/router.ex

pipeline :api do
  plug :accepts, ["json", "json-api"]
  plug GetSocialWeb.Plugs.JSONAPI
end
```

Now that we have our incoming data sorted, we need to wire up our views so they leverage JaSerializer to generate JSON:API payloads.

```elixir
# server/src/lib/get_social_web.ex

defmodule GetSocialWeb do
  def view do
    quote do
      use Phoenix.View, root: "lib/get_social_web/templates",
                        namespace: GetSocialWeb
      use JaSerializer.PhoenixView

      # ...
    end
  end
end
```

## Error Serialization

The last thing we need to do is refactor our `server/src/lib/get_social_web/views/error_view.ex` to send a JSON:API formatted error. To do this we will refactor our `template_not_found` method by borrowing the logic from [`Phoenix.Controller.status_message_from_template`](https://hexdocs.pm/phoenix/Phoenix.Controller.html#status_message_from_template/1) to generate our status code in addition to our title and detail messages.

```elixir
# server/src/lib/get_social_web/views/error_view.ex
defmodule GetSocialWeb.ErrorView do
  # ...

  def template_not_found(template, _assigns) do
    # extract the status code
    status = template
      |> String.split(".")
      |> hd()
      |> String.to_integer()

    # convert the template name into a status message
    status_message = template
      |> Phoenix.Controller.status_message_from_template()

    JaSerializer.ErrorSerializer.format %{
      title: status_message,
      detail: status_message,
      status: status
    }
  end
end
```

And fix our tests:

```elixir
# test/sample_one_web/views/error_view_test.exs
defmodule GetSocialWeb.ErrorViewTest do
  use GetSocialWeb.ConnCase, async: true

  # Bring render/3 and render_to_string/3 for testing custom views
  import Phoenix.View

  test "renders 404.json-api" do
    assert render(GetSocialWeb.ErrorView, "404.json-api", []) == %{
      "errors" => [
        %{
          status: 404,
          detail: "Not Found",
          title: "Not Found"
        }
      ],
      "jsonapi" => %{
        "version" => "1.0"
      }
    }
  end

  test "renders 500.json-api" do
    assert render(GetSocialWeb.ErrorView, "500.json-api", []) == %{
      "errors" => [
        %{
          status: 500,
          detail: "Internal Server Error",
          title: "Internal Server Error"
        }
      ],
      "jsonapi" => %{
        "version" => "1.0"
      }
    }
  end
end
```

{% comment %}

## API Versioning

* [Accept Header](https://www.elviovicosa.com/blog/2016/07/27/phoenix-api-versioning-accept-header.html){: target="_blank"}
* [URL](http://www.elviovicosa.com/blog/2016/07/22/phoenix-api-versioning-url.html){: target="_blank"}

## Contextual Rendering

* https://github.com/vt-elixir/ja\_serializer/issues/79

```elixir
defmodule BookingView do
  use JaSerializer.PhoenixView
  attributes [:commission, :admin_commission]

  def attributes(booking, conn) do
    attrs = super(booking, conn)
    case conn.assigns[:current_user].role do
      :admin -> attrs
      _ -> Map.take(attrs, [:commission])
    end
  end
end
```

## References

* [Building a json-api with phoenix and elixir](https://lobotuerto.com/blog/building-a-json-api-with-phoenix-and-elixir/){: target="_blank"}
* [vt-elixir/ja\_serializer](https://github.com/vt-elixir/ja_serializer){: target="_blank"}
* [Building a phoenix json api](https://robots.thoughtbot.com/building-a-phoenix-json-api){: target="_blank"} (thoughtbot)
* [Testing a phoenix elixir json api](https://robots.thoughtbot.com/testing-a-phoenix-elixir-json-api){: target="_blank"} (thoughtbot)
* [Create an elixir phoenix api part 2: generate an api swagger specification](https://medium.com/everydayhero-engineering/create-an-elixir-phoenix-api-part-2-generate-an-api-swagger-specification-a931536f4c8d){: target="_blank"}
* [Embercasts.com - Fullstack ember with phoenix](https://www.embercasts.com/course/full-stack-ember-with-phoenix/watch/configuring-phoenix-ja-serializer)

{% endcomment %}