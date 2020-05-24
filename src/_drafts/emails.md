---
title:
headline:
cover_image: >-
  https://images.unsplash.com/photo-1531564701487-f238224b7ce3?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=500&h=280&q=80
date: 2019-01-01 00:00:00 -0800
tags:
prerequisite_posts:
  - 2019-01-08-passwordless-authentication
published: false
---

## Overview

Remember Netscape Navigator? Building out emails takes me back to those days. They sucked. Each client renders in their own ways, some support features, others don't. JQuery exists because it abstracted away all of those idiosyncrasies to make the code you write behave the same way across all browsers. Fortunatley, browsers have improved leaps and bounds.

Unfortunatley, email hasn't. Its probably for the better, I can't imagine opening up and email that was a full blown application and the abuse that would follow.

Luckily, we have frameworks that abstract away all of the weird email client issues to make our lives as developers a little easier.

I've been a fan of [Foundation for Emails](https://foundation.zurb.com/emails.html) for a while, but, I've recently ran across [MJML](https://mjml.io/). MJML caught my eye because of its simplicity, it's a complete markup language that essentially replaces HTML. The other perk that really caught my attention is the [VSCode plugin](https://marketplace.visualstudio.com/items?itemName=attilabuti.vscode-mjml) which takes care of making MJML work.

Not only does MJML generate HTML that the email clients can read, but, it will also inline all of the CSS!

To handle sending an email from our application, we will lean on [thoughtbot/bamboo](https://github.com/thoughtbot/bamboo). There are a bunch of [adapters](https://github.com/thoughtbot/bamboo#adapters) for bamboo you can use, for the purposes of this article we will be using `Bamboo.LocalAdapter` and `Bamboo.TestAdapter`.

We're also going to be building off of the [passwordless authentication](/articles/passwordless-authentication/) and [event bus](/articles/eventbus/) articles to finally send our user their magic link so they can login to our application.

## Setting Up Bamboo

We need to add `bamboo` and `phoenix_html` to our mix file. Bamboo uses `phoenix_html` as its templating engine, and because we are building an API only phoenix application, it wasn't included when we generated our project.

```elixir
# project/server/src/mix.exs 
defmodule GetSocial.MixProject do
  # ...

  def application do
    [
      mod: {GetSocial.Application, []},
      extra_applications: [
        # ...
        :bamboo
      ]
    ]
  end

  # ...

  defp deps do
    [
      # ...
      {:bamboo, "~> 1.1"},
      {:phoenix_html, "~> 2.13"}
    ]
  end

  # ...
end
```

After installing our dependencies, we need to configure the bamboo adapters for our different environments.

```elixir
# project/server/src/config/dev.exs

# ...

config :get_social, GetSocial.Mailer,
  adapter: Bamboo.LocalAdapter
```

```elixir
# project/server/src/config/test.exs

# ...

config :get_social, GetSocial.Mailer,
  adapter: Bamboo.TestAdapter
```

While we're at it, let's also configure bamboo to use `Jason` instead of `Poison` since phoenix uses `Jason` by default in 1.4. `Jason` is [benchmarked](https://github.com/michalmuskala/jason#benchmarks) to be more performant than `Poison`.

```elixir
# project/server/src/config/config.exs

config :bamboo, :json_library, Jason
```

Now we can dive in and start building our our emails.

## The Mailer

Bamboo breaks out emails into two different concepts, the `mailer` which handles delivering the email, and the `email` itself.

We'll start with the `mailer` since it's pretty straight forward.

```elixir
# project/server/src/lib/get_social/mailer.ex

defmodule GetSocial.Mailer do
  use Bamboo.Mailer, otp_app: :get_social
end
```

Next up, we'll create our email skeleton email module.

```elixir
defmodule GetSocial.Email do
  use Bamboo.Phoenix, view: GetSocialWeb.EmailView
end
```

Our email module needs a corresponding view so it knows how to lookup the templates.

```elixir
# project/server/src/lib/get_social_web/views/email_view.ex

defmodule GetSocialWeb.EmailView do
  use GetSocialWeb, :view
end
```

## Our Mail Subscriber

Because we are tapping into our [eventbus](/articles/eventbus/) we will be writing our tests around the subscriber and not the mailer or email directly.

```elixir
# project/server/src/test/get_social/subscribers/mail_subscriber_test.exs

defmodule GetSocial.MailSubscriberTest do
  use ExUnit.Case
  use GetSocial.EventCase, otp_app: :get_social
  use Bamboo.Test, shared: true

  alias GetSocial.Events
  alias GetSocial.Subscribers.MailSubscriber

  describe "user_token_request" do
    setup do
      %{
        data: %{
          email: "user@example.com",
          token: "token1234",
          origin: "http://localhost:4200"
        }
      }
    end

    test "subscribed" do
      assert_subscribed { MailSubscriber, ["user_token_request"] }
    end

    test "mail subscriber", %{ data: data } do
      :ok = Events.publish(:user_token_request, data)

      assert_receive {:notify, %EventBus.Model.Event{ topic: :user_token_request, data: data}}
      refute_receive {:delivered_email, %Bamboo.Email{}}
    end

    test "delivers email", %{ data: data } do
      :ok = MailSubscriber.handle_event(:user_token_request, data)

      assert_receive {:delivered_email, %Bamboo.Email{} = email}
      assert email.html_body =~ "#{data.origin}/auth/#{data.token}"
    end
  end
end
```

We will test that our subscriber is subscribed to the correct events, that it recieves the notification, and that it handles the `user_token_request` event.

Now that we have our tests, we can build out our `MailSubscriber`:

```elixir
# project/server/src/lib/get_social/subscribers/mail_subscriber.ex

defmodule GetSocial.Subscribers.MailSubscriber do
  use GetSocial.EventSubscriber, topics: [
    "user_token_request"
  ]

  def handle_event(:user_token_request, _data) do
    :ok
  end

end
```

We now need to register our new `MailSubscriber` in our application.

```elixir
# project/server/src/lib/get_social/application.ex

defmodule GetSocial.Application do
  # ...

  def start(_type, _args) do
    children = [
      # ...
      GetSocial.Subscribers.MailSubscriber
    ]

    # ...
  end

  # ...
end
```

Looks like our subscriber is working as expected, we now just need to have it call our mailer with the proper email. To do that, let's go back to our email module and create a new method that will generate our email template.

```elixir
# project/server/src/lib/get_social/email.ex

defmodule GetSocial.Email do
  use Bamboo.Phoenix, view: GetSocialWeb.EmailView

  def user_token_request_email(%{ email: email, token: token, origin: origin } = data) do
    params = data
    |> Map.put(:url, "#{origin}/auth/#{token}")

    new_email()
    |> from({ "GetSocial.com", "auth@example.com" })
    |> to(email)
    |> subject("Welcome!!!")
    |> render("user_token_request_email.html", params)
  end
end
```

We've created a new `user_token_request_email` that expects to receive a map with `email`, `token`, and `origin`. With that bit of data we can build our return url and send it into our email template. Now, let's go create our MJML email template.

```html
# project/server/src/lib/get_social_web/templates/email/user_token_request_email.mjml

<mjml version="3.3.3">
  <mj-body background-color="#F4F4F4">

    <mj-section></mj-section>

    <mj-section
        background-color="#ffffff"
        text-align="center"
        padding="40px 0px 40px 0px"
        vertical-align="top">
      <mj-column>
        <mj-text align="center" font-size="20px">
          Here is your magic link
        </mj-text>
        <mj-text align="center" font-size="16px">
          <a href="<%= @url %>">Click to sign in!</a>
        </mj-text>
      </mj-column>
    </mj-section>

  </mj-body>
</mjml>
```

We're using EEX within our MJML template so bamboo can inject our `url`. However, we need to first export the MJML to HTML in order for bamboo to pick it up. Luckily, the MJML plugin for VSCode makes this easy. You can press `cmd+shift+p` to open up vscode's command palette and type `export` to filter and then select `MJML: Export HTML`. This will then prompt you for a name, just append `.eex` to the end. The plugin will then export the html version to the same folder as your `.mjml` file.

Now that we have our email and template complete, we can wire it up in our subscriber.

```elixir
# project/server/src/lib/get_social/subscribers/mail_subscriber.ex

defmodule GetSocial.Subscribers.MailSubscriber do
  # ...

  alias GetSocial.{Email,Mailer}

  def handle_event(:user_token_request, data) do
    data
    |> Email.user_token_request_email()
    |> Mailer.deliver_now()

    :ok
  end

end
```

Everything is passing, w00t! We can further verify by curling our endpoint and checking the logs.

```bash
$ curl --request POST \
  --url http://localhost:4000/api/sessions \
  --header 'content-type: application/vnd.api+json' \
  --header 'origin: http://localhost:4200' \
  --data '{ "data": { "attributes": { "email": "user@example.com" } } }'
```

In development we're using the `LocalAdapter` which does not actually send an email. It does however make all of the emails viewable via a fancy dashboard.

## Sent Email Dashboard

Setting up the dashboard is as easy as adding a route to our `router.ex`.

```elixir
# project/server/src/lib/get_social_web/router.ex

defmodule GetSocialWeb.Router do
  # ...

  if Mix.env == :dev do
    # ...
    forward "/messages", Bamboo.SentEmailViewerPlug
  end

  # ...
end
```

Now we can visit [localhost:4000/messages](http://localhost:4000/messages) to view all of the send emails since the server was started. To verify, you can run the same curl command and see the email in the dashboard.
