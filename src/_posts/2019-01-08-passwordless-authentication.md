---
title: Passwordless Authentication
headline: Passwordless Authentication and Magic Links
cover_image: >-
  https://images.unsplash.com/photo-1509822429293-98a3c3fe6bee?ixlib=rb-0.3.5&ixid=eyJhcHBfaWQiOjEyMDd9&s=f0ffbc89619c4b9daa94cf6a11249202&auto=format&fit=crop&w=500&h=280&q=80
date: 2019-01-08 00:00:00 -0800
tags:
  - jsonapi
  - elixir
  - testing
  - jwt
prerequisite_posts:
  - 2018-12-25-eventbus
published: true
---

## Overview

The new trend in authentication, in addition to [2FA](/tags/2fa/), is passwordless login. This method involves the user submitting their email and getting a “magic link” emailed to them which would authenticate them when they visited it.

The biggest argument against this method is “what if your email is compromised?”

The common sense response is, well, you’re screwed. Think about it, traditional authentication systems require some sort of username/email and a password to login. But, there’s also a way to recover that password, typically via… email.

The benefits far outweigh the negatives with passwordless authentication, the biggest is eliminating the need for account recovery mechanisms like “forgot password”. This also simplifies the registration process, you no longer need to verify if an email has been used before (which also removes a vector of compromising an account). Instead, we can silently fail and only start registration if the user clicks the magic link. This will also cut down on spam registrations in the database.

One thing we do have to consider is spamming an email address, to prevent this we just limit the number of calls that can be made to the endpoint per minute from a particular device or email.

## The Plan

The user will submit their email address and receive an email with a magic link containing a JWT token (ie `example.com/auth/{token}`).

**POST /api/sessions**

REQUEST

```json
{
  "data": {
    "attributes": {
      "email": "user@example.com"
    }
  }
}
```

RESPONSE: `201 created`

The client would then perform another `POST /api/session`, this time with the `token` from the link.

```json
{
  "data": {
    "attributes": {
      "token": "token from email"
    }
  }
}
```

The server will validate the token and send back the users actual `auth token` to be used in subsequent requests.

At this point, we've verified that the email is valid and the token sent to the email is valid, so now we can return the user, or create one.

## Public API Interface

To get started, let’s write a controller test and define what the public interface will look like. Make sure tests are running so we can keep track of our progress by executing `docker-compose run --rm server mix test.watch`.

***NOTE:** If you don’t have a `mix test.watch` command, be sure to checkout the [testing](/articles/testing/) before continuing as we will be using it as our foundation here.*

For our first test we want request a “magic link” by providing an email address. Because we don’t want to reveal too much information to an intruder, the api response should be a `201 created` with an empty body.

```elixir
# server/src/test/get_social_web/controllers/session_controller_test.exs
defmodule GetSocialWeb.SessionControllerTest do
  use GetSocialWeb.ApiCase, resource_name: :session

  describe "request a magic link" do
    test "create", %{ conn: conn } do
      response = conn
        |> request_create(%{ email: "user@example.com" })
        |> json_response(201)

      assert response == nil
    end
  end
end
```

If we run our tests, we will get an `(UndefinedFunctionError) function GetSocialWeb.Router.Helpers.session_path/2 is undefined or private`. We can fix that by adding our `/sessions` route.

```elixir
# server/src/lib/get_social_web/router.ex
defmodule GetSocialWeb.Router do
  # ...

  scope "/api", GetSocialWeb do
    # ...

    post "/sessions", SessionController, :create
  end
end
```

With the route added, we should now get a `(UndefinedFunctionError) function GetSocialWeb.SessionController.init/1 is undefined (module GetSocialWeb.SessionController is not available)`. Let’s create our `GetSocialWeb.SessionController` and add the `create\2` method that will just set the status to `201` and return an empty response.

```elixir
# server/src/lib/get_social_web/controllers/session_controller.ex
defmodule GetSocialWeb.SessionController do
  use GetSocialWeb, :controller

  def create(conn, _) do
    conn
    |> put_status(:created)
    |> json(nil)
  end
end
```

Now our tests should pass. Let’s next test creating a session from the magic link’s token. When we create a session with a `token`, we expect to get back the details that our application can use to authenticate requests to the api. Bare minimum we will need an “authentication token” (`auth_token`), for this example we will also expect an “email address” (`email`).

For now we will return a fake token until we implement the token generation.

```elixir
# server/src/test/get_social_web/controllers/session_controller_test.exs
defmodule GetSocialWeb.SessionControllerTest do
  # ...

  describe "start session from token" do
    setup %{ conn: conn } do
      %{ token: "12345" }
    end

    test "when valid", %{ conn: conn, token: token } do
      response = conn
        |> request_create(%{ token: token })
        |> jsonapi_response(201)
        |> Kernel.get_in(["data", "attributes"])

      assert response["auth-token"]
      assert response["email"] == "user@example.com"
    end
  end
end
```

With that, our tests should fail because our endpoint is returning `nil`. To fix this, we will add pattern matching to our `SessionController#create\2` method and look for a `token` attribute.

```elixir
# lib/get_social_web/controllers/session_controller.ex
defmodule GetSocialWeb.SessionController do
  # ...

  def create(conn, %{ "data" => %{ "token" => _token }}) do
    conn
    |> put_status(:created)
    |> json(%{
      data: %{
        id: "",
        attributes: %{
          "email" => "user@example.com",
          "auth-token" => "some-auth-token"
        }
      },
      jsonapi: %{
        version: "1.0"
      }
    })
  end

  def create(conn, _) do
    # ...
  end
end
```

Looking good, but, what happens if we don’t send an email address when requesting a passwordless link?

```elixir
# server/src/test/get_social_web/controllers/session_controller_test.exs
defmodule GetSocialWeb.SessionControllerTest do
  # ...

  describe "request a magic link" do
    # ...

    test "validates input", %{ conn: conn } do
      response = conn
        |> request_create(%{})
        |> jsonapi_response(422)

      assert response == %{
        "errors" => [
          %{
            "detail" => "Email can't be blank",
            "source" => %{
              "pointer" => "/data/attributes/email"
            },
            "title" => "can't be blank"
          }
        ],
        "jsonapi" => %{
          "version" => "1.0"
        }
      }
    end
  end
end
```

Hmm, still getting a `201`. We’d expect to get a `422` with some validation errors. Let’s fix it. We need to create a validation using an ecto changeset, but, we are not persisting the `session` to the database. To handle for this, we will use ecto’s [schemaless changesets](https://hexdocs.pm/ecto/Ecto.Changeset.html#module-schemaless-changesets).

To get it working, let’s add the logic directly to our `create(conn, _)` method in our controller for now.

```elixir
# server/src/lib/get_social_web/controllers/session_controller.ex
defmodule GetSocialWeb.SessionController do
  # ...

  def create(conn, %{ "data" => %{ "token" => _token }}) do
    # ...
  end

  def create(conn, %{ "data" => params }) do
    with {:ok, _} <- conn |> build_passwordless_token(params) do
      conn
      |> put_status(:created)
      |> json(nil)
    else
      {:error, %Ecto.Changeset{} = changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(JaSerializer.EctoErrorSerializer.format(changeset))
    end
  end

  def build_passwordless_token(_conn, params) do
    params |> create_changeset()
  end

  def create_changeset(%{} = params) do
    data  = %{}
    types = %{email: :string}

    {data, types}
      |> Ecto.Changeset.cast(params, Map.keys(types))
      |> Ecto.Changeset.validate_required([:email])
      |> Ecto.Changeset.apply_action(:insert)
  end
end
```

If you’ve already followed along with the [testing](/articles/testing) article, then you’ve already ran a generator which would have created a `server/src/lib/get_social_web/controllers/fallback_controller.ex` and `server/src/lib/get_social_web/views/changeset_view.ex`. If you have these files, we can clean up our `SessionController` even more by using the `action_fallback` method.

Instead of calling the `action_fallback` macro in each of our controllers, let's add it to the `GetSocialWeb#controller` method that is called when we do `use GetSocialWeb, :controller`.

```elixir
# server/src/lib/get_social_web.ex
defmodule GetSocialWeb do
  # ...

  def controller do
    quote do
      # ...

      action_fallback GetSocialWeb.FallbackController
    end
  end

  # ...
end
```

The `GetSocialWeb.FallbackController` will catch the `{:error, changeset}` we are handling in the `else` block, meaning, we can remove it from our `create(conn, %{ "data" => params })` method all together.

```elixir
# server/src/lib/get_social_web/controllers/session_controller.ex
defmodule GetSocialWeb.SessionController do
  # ...

  def create(conn, %{ "data" => params }) do
    with {:ok, _} <- conn |> build_passwordless_token(params) do
      conn
      |> put_status(:created)
      |> json(nil)
    end
  end

  # ...
end
```

We will need to remove the `action_fallback` from all of our controllers or we will get a compilation error `(RuntimeError) action_fallback can only be called a single time per controller.`.

We’ll also take this opportunity to clean up our `create(conn, %{ "data" => %{ "token" => token }})` method as well. Instead of manually rendering our jsonapi, let's refactor to use a view:

```elixir
# server/src/lib/get_social_web/views/session_view.ex
defmodule GetSocialWeb.SessionView do
  use GetSocialWeb, :view

  attributes [:auth_token]
end
```

With our view created, we can refactor our controller action to `render("show.json-api", data: session)`, we’ll also create a method that will eventually handle restoring a magic link token. For now, we’ll just hard code the response.

```elixir
# server/src/lib/get_social_web/controllers/session_controller.ex
defmodule GetSocialWeb.SessionController do
  # ...

  def create(conn, %{ "data" => %{ "token" => token }}) do
    with {:ok, session} <- conn |> restore_passwordless_token(token) do
      conn
      |> put_status(:created)
      |> render("show.json-api", data: session)
    end
  end

  # ...

  def restore_passwordless_token(_conn, _token) do
    {:ok, %{ id: Ecto.UUID.generate, email: "user@example.com", auth_token: Ecto.UUID.generate }}
  end
end
```

Now we’ve got the building blocks for our passwordless authentication, next steps are generating tokens, sending the email, and verifying the tokens.

Before moving on, let's refactor our extra methods out of our controller and into a couple context modules.

We will start by refactoring our `create_changeset` method into a `Session` context. This will help us differentiate our `User` from an `auth_token` and the passwordless authentication `Session`. We will also refactor to use an `embedded_schema` instead of a schemaless changeset.

```elixir
# server/src/lib/get_social_web/authentication/session.ex
defmodule GetSocialWeb.Authentication.Session do
  use Ecto.Schema

  import Ecto.Changeset

  alias GetSocialWeb.Authentication.Session

  @primary_key false

  embedded_schema do
    field :email
  end

  def create_changeset(params) do
    %Session{}
      |> cast(params, [:email])
      |> validate_required([:email])
      |> apply_action(:insert)
  end
end
```

We will move our `build_passwordless_token`, `restore_passwordless_token`, and `build_passwordless_token_claims` methods into a new `Authentication` module.  We also need to update our `build_passwordless_token` to call `create_changeset` on `GetSocialWeb.Authentication.Session`.

```elixir
# server/src/lib/get_social_web/authentication/authentication.ex
defmodule GetSocialWeb.Authentication do
  alias GetSocial.Guardian
  alias GetSocialWeb.Authentication.Session

  def build_passwordless_token(_conn, params) do
    params |> Session.create_changeset()
  end

  def restore_passwordless_token(conn, token) do
    {:ok, %{ id: Ecto.UUID.generate, email: "user@example.com", auth_token: Ecto.UUID.generate }}
  end
end
```

Now that we've refactored our code into its own module, let's add some tests. We'll start with our `build_passwordless_token`.

```elixir
# server/src/test/get_social_web/authentication_test.exs
defmodule GetSocialWeb.AuthenticationTest do
  use GetSocialWeb.ConnCase

  alias GetSocialWeb.Authentication

  describe "build_passwordless_token" do

    test "when invalid", %{ conn: conn } do
      assert {:error, %Ecto.Changeset{}} = conn |> Authentication.build_passwordless_token(%{})
    end

    test "when valid", %{ conn: conn } do
      {:ok, result} = conn |> Authentication.build_passwordless_token(%{ email: "user@example.com" })

      # ensure our result is not a struct
      refute result |> Map.has_key?(:__struct__)

      # ensure we get the expected keys
      assert %{ email: "user@example.com", token: token } = result

      # ensure we get a token value
      assert token
    end

  end
end
```

Our tests are failing because it appears we are not actually generating a `token` for our passwordless link. Let's update our implementation…

```elixir
# server/src/lib/get_social_web/authentication/authentication.ex
defmodule GetSocialWeb.Authentication do
  # ...

  def build_passwordless_token(_conn, params) do
    with {:ok, result} <- params |> Session.create_changeset() do
      result = result
      |> Map.from_struct()
      |> Map.put(:token, Ecto.UUID.generate)

      {:ok, result}
    end
  end

  # ...
end
```

Fixed! Let's now add some tests around our `restore_passwordless_token` method.

```elixir
# server/src/test/get_social_web/authentication_test.exs
defmodule GetSocialWeb.AuthenticationTest do
  # ...

  describe "restore_passwordless_token" do

    setup %{ conn: conn } do
      conn |> Authentication.build_passwordless_token(%{ email: "user@example.com" })
    end

    test "when invalid", %{ conn: conn } do
      assert {:error, :invalid_token} == conn |> Authentication.restore_passwordless_token("12345")
    end

    test "when valid", %{ conn: conn, token: token } do
      {:ok, result} = conn |> Authentication.restore_passwordless_token(token)

      assert %{ email: "user@example.com", auth_token: auth_token } = result
      assert auth_token
    end

  end
end
```

We need to fix our implementation when we get an invalid token, for now we will just consider "12345" an invalid token.

```elixir
# server/src/lib/get_social_web/authentication/authentication.ex
defmodule GetSocialWeb.Authentication do
  # ...

  def restore_passwordless_token(_conn, "12345"), do: {:error, :invalid_token}
  def restore_passwordless_token(_conn, _token) do
    {:ok, %{ id: Ecto.UUID.generate, email: "user@example.com", auth_token: Ecto.UUID.generate }}
  end
end
```

Oops. Looks like our `GetSocialWeb.SessionControllerTest` tests are now failing. This is because we are hardcoding "12345" as our valid token. Let's go update our controller tests to use the new `Authentication` module, and also add a test to handle invalid tokens.

```elixir
defmodule GetSocialWeb.SessionControllerTest do
  # ...

  describe "start session from token" do
    setup %{ conn: conn } do
      conn |> GetSocialWeb.Authentication.build_passwordless_token(%{ email: "user@example.com" })
    end

    test "when valid", %{ conn: conn, token: token } do
      response = conn
        |> request_create(%{ token: token })
        |> jsonapi_response(201)
        |> Kernel.get_in(["data", "attributes"])

      assert response["auth-token"]
      assert response["email"] == "user@example.com"
    end

    test "when invalid", %{ conn: conn } do
      response = conn
        |> request_create(%{ token: "12345" })
        |> jsonapi_response(401)

      assert response == %{
        "errors" => [
          %{
            "status" => 401,
            "detail" => "Unauthorized",
            "title" => "Unauthorized"
          }
        ],
        "jsonapi" => %{
          "version" => "1.0"
        }
      }
    end
  end
end
```

Our tests fail, look's like we need to update our `GetSocialWeb.FallbackController` to handle for the `{:error, :invalid_token}` returned by our `GetSocialWeb.Authentication.restore_passwordless_token\2` method.

```elixir
# server/src/lib/get_social_web/controllers/fallback_controller.ex
defmodule GetSocialWeb.FallbackController do
  # ...

  def call(conn, {:error, :invalid_token}), do: call(conn, {:error, :unauthorized})
  def call(conn, {:error, :unauthorized}) do
    conn
    |> put_status(:unauthorized)
    |> put_view(GetSocialWeb.ErrorView)
    |> render(:"401")
  end
end
```

Because `:unauthorized` is a pretty common error case, we will add a method that handles for `:unauthorized` explicitly. Then, for our `:invalid_token`, we will just call the `:unauthorized` error handler.

Now, in our `SessionController`, we can delete the `build_passwordless_token`, `restore_passwordless_token`, and `create_changeset` methods and instead import them from our new `GetSocial.Authentication` module.

```elixir
defmodule GetSocialWeb.SessionController do
  # ...

  import GetSocialWeb.Authentication, only: [
    build_passwordless_token: 2,
    restore_passwordless_token: 2
  ]

  # ...
end
```

NOTE: Instead of importing the methods, we could add an alias to `GetSocialWeb.Authentication` and call the methods directly like `Authentication.build_passwordless_token` and `Authentication.restore_passwordless_token`. I’ve chose to import them to reduce the number of changes required in the controller to hopefully make this article a little easier to follow.

## Generating Magic Link Tokens

Our magic link tokens will be JWT’s that will contain the user’s email address and a signature that we can use to verify the tokens authenticity. We will use [guardian](https://github.com/ueberauth/guardian){: target="_blank"} for generating our JWTs and authentication.

First things first, let’s [install guardian](https://github.com/ueberauth/guardian#installation){: target="_blank"}:

```elixir
# server/src/mix.exs
defmodule GetSocial.MixProject do
  # ...

  defp deps do
    [
      # ...
      {:guardian, "~> 1.0"}
    ]
  end

  # ...
end
```

Then we’ll create our `Guardian` module:

```elixir
# server/src/lib/get_social/guardian.ex
defmodule GetSocial.Guardian do
  use Guardian, otp_app: :get_social

  def subject_for_token(_, _claims), do: {:error, :invalid_subject}
  def resource_from_claims(_claims), do: {:error, :invalid_claim}
end
```

and add guardian to our [configuration](https://github.com/ueberauth/guardian#installation):

```elixir
# server/src/config/config.exs

# ...

config :get_social, GetSocial.Guardian,
       issuer: "get_social",
       secret_key: "Secret key. You can use `mix guardian.gen.secret` to get one"

# ...
```

With Guardian setup, we can start to implement our `SessionController#build_passwordless_token\2` method. Let's write some tests first. We need to expand our "when valid" tests to decode the `token` returned. We expect to get a JWT with the email address and a `typ` claim of `otp` and our `sub` value to equal the email address.

```elixir
# server/src/test/get_social_web/authentication_test.exs
defmodule GetSocialWeb.AuthenticationTest do
  # ...

  describe "build_passwordless_token" do
    # ...

    test "when valid", %{ conn: conn } do
      email = "user@example.com"
      {:ok, result} = conn |> Authentication.build_passwordless_token(%{ email: email })

      refute result |> Map.has_key?(:__struct__)
      assert %{ email: ^email, token: token } = result

      assert {:ok, session, claims} = GetSocial.Guardian.resource_from_token(token)
      assert %{ id: _id, email: ^email } = session

      assert claims["typ"] == "otp"
      assert claims["sub"] == email
    end

  end

  # ...
end
```

We get an argument error because the token we are currently sending isn't a valid JWT token. Let's update our implementation to return a JWT.

```elixir
# server/src/lib/get_social_web/authentication/authentication.ex
defmodule GetSocialWeb.Authentication do
  # ...

  alias GetSocial.Guardian

  # ...

  def build_passwordless_token(conn, params) do
    with {:ok, claims} <- conn |> build_passwordless_token_claims(),
         {:ok, changeset} <- params |> Session.create_changeset(),
         {:ok, token, _claims} <- Guardian.encode_and_sign(changeset, claims, ttl: { 5, :minute }) do

      detail = changeset
      |> Map.from_struct()
      |> Map.put(:token, token)

      {:ok, detail}
    end
  end

  def build_passwordless_token_claims(_conn) do
    {:ok, %{ typ: "otp" }}
  end

  # ...
end
```

Our tests are now failing because of an `{:error, :invalid_subject}`, this is because we need to tell guardian how to generate the `sub` for our `Session`.

```elixir
# server/src/lib/get_social/guardian.ex
defmodule GetSocial.Guardian do
  # ...

  alias GetSocialWeb.Authentication.Session

  def subject_for_token(%Session{ email: email }, _claims), do: {:ok, email}

  # ...
end
```

Our tests are now failing with `{:error, :invalid_claim}`, this is because guardian doesn't know how to retrieve the resource from the JWT claims. Let's update our guardian config.

```elixir
# server/src/lib/get_social/guardian.ex
defmodule GetSocial.Guardian do
  # ...

  def resource_from_claims(%{ "typ" => "otp", "sub" => email }) do
    {:ok, %{ id: Ecto.UUID.generate, email: email }}
  end
  def resource_from_claims(_claims), do: {:error, :invalid_claim}
end
```

For now we will just fake a user, later we will add the logic for retrieving or creating a user to this method. With that, we should be able to work on implementing our `restore_passwordless_token` method. First step is to add some tests that decode the `auth_token`.

```elixir
defmodule GetSocialWeb.AuthenticationTest do
  # ...

  describe "restore_passwordless_token" do
    # ...

    test "when valid", %{ conn: conn, token: token } do
      email = "user@example.com"

      {:ok, result} = conn |> Authentication.restore_passwordless_token(token)

      assert %{ email: ^email, auth_token: auth_token } = result
      assert {:ok, user, claims} = GetSocial.Guardian.resource_from_token(auth_token)
      assert %{ id: id } = user

      assert claims["typ"] == "access"
      assert claims["sub"] == id
    end

  end
end
```

We should get the familiar argument error returned from `GetSocial.Guardian.resource_from_token`. This is because our `Authentication.restore_passwordless_token` is returning a GUID instead of a JWT. Let's also handle the `ArgumenrError` and roll it into an `:invalid_token`.

Let’s fix our implementation now.

```elixir
# server/src/lib/get_social_web/authentication/authentication.ex
defmodule GetSocialWeb.Authentication do
  # ...

  def restore_passwordless_token(conn, token) do
    with {:ok, claims} <- conn |> build_passwordless_token_claims(),
      {:ok, %{ "sub" => email }} <- token |> Guardian.decode_and_verify(claims),
      {:ok, resource, _claims} = token |> Guardian.resource_from_token(claims),
      {:ok, auth_token, _claims} <- resource |> Guardian.encode_and_sign() do

      {:ok, %{ id: resource.id, email: email, auth_token: auth_token }}
    else
      {:error, %ArgumentError{}} -> {:error, :invalid_token}
    end
  end

  # ...
end
```

We can now remove our hardcoded `restore_passwordless_token` for "12345".

The `restore_passwordless_token` method does a few things:

**1. Validates the magic link token:** This is handled by guardian automatically with `Guardian.resource_from_token\2`.

**2. Retrieves the user from the database, or creates one:** This is handled by `GetSocial.Guardian.resource_from_claims\1`

**3. Returns a new JWT to be used in our `authentication` header:** This is generated by `Guardian.encode_and_sign\1`.

Now we are getting an `{:error, :invalid_subject}`. This is because guardian doesn't know how to convert our psuedo "user" into a JWT subject. We can add another `subject_for_token` to our guardian module:

```elixir
defmodule GetSocial.Guardian do
  # ...

  def subject_for_token(%Session{ email: email }, _claims), do: {:ok, email}
  def subject_for_token(%{ id: id }, _claims), do: {:ok, id}
  def subject_for_token(_, _claims), do: {:error, :invalid_subject}

  # ...
end
```

Our tests are now failing due to a `** (MatchError) no match of right hand side value: {:error, :invalid_claim}`. This is because we need to tell guardian how to get the user from the `auth_token` `claims`. To do this we need to add a new `GetSocial.Guardian#resource_from_claims` that expects our `typ` and `sub` from the passwordless link token:

```elixir
defmodule GetSocial.Guardian do
  # ...

  def resource_from_claims(%{ "typ" => "access", "sub" => id }) do
    user = %{ id: id }
    {:ok, user}
  end
  def resource_from_claims(%{ "typ" => "otp", "sub" => email }) do
    # ...
  end

  # ...
end
```

## Testing For Invalid Tokens

Let’s write some tests for invalid tokens, first tests handles invalid JWT token, and the second attempts an [“alg: none”](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/){: target="_blank"} attack to verify the contents of a valid JWT.

```elixir
# server/src/test/get_social_web/authentication_test.exs
defmodule GetSocialWeb.AuthenticationTest do

  # ...

  describe "restore_passwordless_token" do
    # ...

    test "when invalid", %{ conn: conn } do
      assert {:error, :invalid_token} = conn |> Authentication.restore_passwordless_token("12345")
    end

    test "`alg: none` attack", %{ conn: conn } do
      header = %{
          alg: "none",
          typ: "JWT"
        }
        |> Jason.encode!
        |> Base.encode64

      payload = %{
          sub: "haxor@example.com"
        }
        |> Jason.encode!
        |> Base.encode64

      invalid_token = [header, payload, nil]
        |> Enum.join(".")

      assert {:error, :invalid_token} = conn
        |> Authentication.restore_passwordless_token(invalid_token)
    end
  end
end
```

Looks like guardian returns a different error from `Guardian.resource_from_token\2` for our different inputs. Let's update `restore_passwordless_token` so it returns a consistent error tuple. We dont really care "why" it failed at this point, just that the token is invalid.

```elixir
# server/src/lib/get_social_web/authentication/authentication.ex
defmodule GetSocialWeb.Authentication do
  # ...

  def restore_passwordless_token(conn, token) do
    with {:ok, claims} <- conn |> build_passwordless_token_claims(),
      # ...
    else
      {:error, _} -> {:error, :invalid_token}
    end
  end

  # ...
end
```

At this point, we've generated a passwordless authentication token and generated an authorization token we can use to identify our user.

## User Authorization

Now that we have our passwordless authentication flow sorted, let's work on the authorization flow. To do this, we will need to create a `User`.

```shell
$ docker-compose run --rm server \
    mix phx.gen.schema Accounts.User users \
      email:string:unique
$ docker-compose run --rm server \
    mix ecto.migrate
```

Let's first update our tests to expect a `User` when we restore our `auth_token`. We'll also update our test to assert that the token `id` is equal to the user `id`.

```elixir
# server/src/test/get_social_web/authentication_test.exs
defmodule GetSocialWeb.AuthenticationTest do
  # ...

  alias GetSocial.Accounts.User

  # ...

  describe "restore_passwordless_token" do
    # ...

    test "when valid", %{ conn: conn, token: token } do
      # ...

      assert %User{ id: id } = user

      # ...
    end

    # ...
  end
end
```

With our failing test, we can now update our `GetSocial.Guardian#resource_from_claims` to return an existing or new user.

```elixir
# server/src/lib/get_social/guardian.ex
defmodule GetSocial.Guardian do
  # ...

  alias GetSocial.Accounts.User
  # ...

  def subject_for_token(%User{ id: id }, _claims), do: {:ok, id}
  # ...

  def resource_from_claims(%{ "typ" => "access", "sub" => id }) do
    with %User{} = user <- User |> Repo.get(id) do
      {:ok, user}
    else
      _ -> {:error, :invalid_subject}
    end
  end
  def resource_from_claims(%{ "typ" => "otp", "sub" => email }) do
    user = Repo.get_by(User, %{ email: email }) || %User{ email: email }

    user
      |> User.changeset(%{})
      |> Repo.insert_or_update
  end
  # ...
end
```

### Current User

Now that we have our passwordless tokens and can convert those to an `auth_token`, but, we need to turn the `auth_token` into a current user. To do this, we will create a controller that will return the current users' account details.

Let's first write some tests.

```elixir
# server/src/test/get_social_web/controllers/account_controller_test.exs
defmodule GetSocialWeb.AccountControllerTest do
  use GetSocialWeb.ApiCase, resource_name: :account

  alias GetSocial.Guardian
  alias GetSocialWeb.Authentication

  setup do
    %{ user: insert(:user) }
  end

  test "when empty", %{ conn: conn, user: user } do
    assert conn
      |> request_show(user)
      |> jsonapi_response(401)
  end

  test "when invalid", %{ conn: conn, user: user } do
    assert conn
      |> put_req_header("authorization", "Bearer INVALID")
      |> request_show(user)
      |> jsonapi_response(401)
  end

  test "when valid", %{ conn: conn, user: user } do
    {:ok, auth_token, _claims} = user |> Guardian.encode_and_sign()

    assert conn
      |> put_req_header("authorization", "Bearer #{auth_token}")
      |> request_show(user)
      |> jsonapi_response(200)
  end

  test "cannot access other user", %{ conn: conn, user: user } do
    %{ id: id } = insert(:user)
    {:ok, auth_token, _claims} = user |> Guardian.encode_and_sign()

    assert conn
      |> put_req_header("authorization", "Bearer #{auth_token}")
      |> request_show(id)
      |> jsonapi_response(401)
  end

  test "when using passwordless token", %{ conn: conn, user: user } do
    {:ok, %{ token: auth_token }} = Authentication.build_passwordless_token(conn, %{ email: "user@example.com" })

    assert conn
      |> put_req_header("authorization", "Bearer #{auth_token}")
      |> request_show(user)
      |> jsonapi_response(401)
  end
end
```

Our tests are complaining of an undefined or private `account_path/2` method. Lets add our new account path to our router, this route will also be run through a new `:authorize` pipeline in addition to the `:api` pipeline.

```elixir
# server/src/lib/get_social_web/router.ex
defmodule GetSocialWeb.Router do
  # ...

  pipeline :authorize do
    # coming soon
  end

  scope "/api", GetSocialWeb do
    pipe_through :api

    # ...
  end

  scope "/api", GetSocialWeb do
    pipe_through [:api, :authorize]

    get "/accounts", AccountController, :index
  end
end
```

Now we need to create our `AccountController`, by default we will just render an `{:error, :unauthorized}`

```elixir
# server/src/lib/get_social_web/controllers/account_controller.ex
defmodule GetSocialWeb.AccountController do
  use GetSocialWeb, :controller

  def index(_conn, _params) do
    {:error, :unauthorized}
  end
end
```

With our controller stubbed out, we can create our `user_factory`.

```elixir
# server/src/test/support/factory.ex
defmodule GetSocial.Factory do
  # ...

  def user_factory do
    %GetSocial.Accounts.User{
      email: sequence(:email, &"email-#{&1}@example.com")
    }
  end

  # ...
end
```

Now we can start working on our `:authorize` pipeline. We will create a new plug that handles all of the guardian setup and assigns a `:current_user` to our connection.

```elixir
# server/src/lib/get_social_web/plugs/authorization.ex
defmodule GetSocialWeb.Plugs.Authorization do
  use Guardian.Plug.Pipeline, otp_app: :get_social,
                              module: GetSocial.Guardian,
                              error_handler: __MODULE__

  alias GetSocialWeb.FallbackController

  plug Guardian.Plug.VerifyHeader, realm: "Bearer", claims: %{typ: "access"}
  plug Guardian.Plug.LoadResource, allow_blank: false
  plug Guardian.Plug.EnsureAuthenticated
  plug :assign_current_user

  defp assign_current_user conn, _ do
    conn |> Plug.Conn.assign(:current_user, Guardian.Plug.current_resource(conn))
  end

  def auth_error(conn, _error, _opts), do: FallbackController.call(conn, { :error, :unauthorized })
end
```

We can now add our `GetSocialWeb.Plugs.Authorization` plug to the pipeline.

```elixir
defmodule GetSocialWeb.Router do
  # ...

  pipeline :authorize do
    plug GetSocialWeb.Plugs.Authorization
  end

  # ...
end
```

Now that our `:authorize` pipeline is wired up, we can work on returning the current user's details from our controller.

```elixir
# server/src/lib/get_social_web/controllers/account_controller.ex
defmodule GetSocialWeb.AccountController do
  use GetSocialWeb, :controller

  def index(conn, _params) do
    render(conn, "index.json-api", data: conn.assigns[:current_user])
  end
end
```

Our tests are now failing because we need to add the `AccountView`, for now we will just return the user's email address.

```elixir
# server/src/lib/get_social_web/views/account_view.ex
defmodule GetSocialWeb.AccountView do
  use GetSocialWeb, :view

  attributes [:email]
end
```

I'm not a fan of using `conn.assigns[:current_user]` to get the user, instead I'd like to have the current user passed into the action like we get with the `Conn` and `params`:

```elixir
# server/src/lib/get_social_web/controllers/account_controller.ex
defmodule GetSocialWeb.AccountController do
  # ...

  def index(conn, _params, user) do
    render(conn, "index.json-api", data: user)
  end
end
```

To do this we can use some good ol metaprogramming. First thing we need to do is create a new module that we can use in our controllers that require authentication.

```elixir
# server/src/lib/get_social_web/controllers/authenticated_controller.ex
defmodule GetSocialWeb.AuthenticatedController do

  alias GetSocialWeb.AuthenticatedController

  import Phoenix.Controller, only: [
    action_name: 1
  ]

  defmacro __using__(_) do
    quote do
      def action(conn, _), do: AuthenticatedController.__action__(__MODULE__, conn)
      defoverridable action: 2
    end
  end

  def __action__(controller, conn) do
    action = action_name(conn)

    params = cond do
      function_exported?(controller, action, 3) ->
        [conn, conn.params, conn.assigns[:current_user]]
      true ->
        [conn, conn.params]
    end

    controller
    |> apply(action, params)
  end
end
```

Then, we can add `use GetSocialWeb.AuthenticatedController` to our `AccountController` and add the `user` as the third argument.

```elixir
# server/src/lib/get_social_web/controllers/account_controller.ex
defmodule GetSocialWeb.AccountController do
  use GetSocialWeb, :controller
  use GetSocialWeb.AuthenticatedController

  def index(conn, _params, user) do
    render(conn, "index.json-api", data: user)
  end
end
```

## Sending the magic link email

The last little bit to do is to actually send the email that contains the magic link. We will be leveraging the code build in the [event bus](/articles/eventbus/) and [email](/articles/emails/) so be sure to visit those articles first.

### The Link

For our magic link email we still need to build the actual link, but, we still need the host for link.

One option would be to hardcode the host, but, our API will be consumed by a javascript client in the browser. We can actually leverage the `origin` header that will be sent by the browser.

> The Origin request header indicates where a fetch originates from. It doesn't include any path information, but only the server name. It is sent with CORS requests, as well as with POST requests. It is similar to the Referer header, but, unlike this header, it doesn't disclose the whole path. - [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin)

Using the `origin` we can link the user back to where they came from.

*NOTE:* You will want to validate and restrict origins in the application, but, that can be done at a higher level with a plug. Be sure to checkout the [CORS](/articles/cors/) article for more on restricting API access from browsers.

We need to update our `build_passwordless_token` method to pull the

```elixir
# project/server/src/test/get_social_web/authentication_test.exs

defmodule GetSocialWeb.AuthenticationTest do
  # ...

  setup do
    conn = build_conn()
      |> put_req_header("origin", "http://localhost:4200")

    %{ conn: conn }
  end

  describe "build_passwordless_token" do

    # ...

    test "when valid", %{ conn: conn } do
      email = "user@example.com"
      # ...

      assert %{ email: ^email, token: token, origin: "http://localhost:4200" } = result

      # ...
    end

  end

  # ...
end
```

Now we can go update our `build_passwordless_token` to include the `origin`:

```elixir
# project/server/src/lib/get_social_web/authentication/authentication.ex

defmodule GetSocialWeb.Authentication do
  # ...

  @spec build_passwordless_token(Plug.Conn.t, map) :: map
  def build_passwordless_token(conn, params) do
    with {:ok, claims} <- conn |> build_passwordless_token_claims(),
         {:ok, changeset} <- params |> Session.create_changeset(),
         {:ok, token, _claims} <- Guardian.encode_and_sign(changeset, claims, ttl: { 5, :minute }) do

      origin = conn
        |> Conn.get_req_header("origin")
        |> List.first

      detail = changeset
        |> Map.from_struct()
        |> Map.put(:token, token)
        |> Map.put(:origin, origin)

      {:ok, detail}
    end
  end

  # ...
end
```

Now our event payload will have enough information to generate a magic link like `"#{origin}/auth/#{token}"`.

### Wiring Up The Events

Let's first wire up our event triggers for when the user requests a passwordless token and another for when the user authenticates with their token.

We need to register these events to our `config.exs`:

```elixir
# project/server/src/config/config.exs

config :event_bus,
  topics: [
    :user_authenticated,
    :user_token_request
  ]
```

Now we can update our tests:

```elixir
# project/server/src/test/get_social_web/controllers/session_controller_test.exs
defmodule GetSocialWeb.SessionControllerTest do
  # ...
  use GetSocial.EventCase, otp_app: :get_social

  describe "request a magic link" do
    test "create", %{ conn: conn } do
      # ...

      assert_receive {
        :notify,
        %{
          topic: :user_token_request,
          data: %{
            email: "user@example.com",
            origin: "http://localhost:4200",
            token: _token
          }
        }
      }
    end

    test "validates input", %{ conn: conn } do
      response = conn
        |> request_create(%{})
        |> jsonapi_response(422)

      refute_received {:notify, %{ topic: :user_token_request }}

      # ...
    end
  end

  describe "start session from token" do
    # ...

    test "when valid", %{ conn: conn, token: token } do
      response = conn
        |> request_create(%{ token: token })
        |> jsonapi_response(201)

      assert_receive {
        :notify,
        %{
          topic: :user_authenticated,
          data: %{
            id: id,
            email: email,
            auth_token: auth_token
          }
        }
      }

      assert response == %{
        "data" => %{
          "id" => id,
          "type" => "session",
          "attributes" => %{
            "auth-token" => auth_token
          }
        },
        "jsonapi" => %{
          "version" => "1.0"
        }
      }
    end

    test "when invalid", %{ conn: conn } do
      response = conn
        |> request_create(%{ token: "12345" })
        |> jsonapi_response(401)

      refute_received {:notify, %{ topic: :user_authenticated }}

      # ...
    end
  end
end
```

With our tests failing we can go add our triggers:

```elixir
# project/server/src/lib/get_social_web/controllers/session_controller.ex

defmodule GetSocialWeb.SessionController do
  # ...

  alias GetSocial.Events

  # ...

  def create(conn, %{ "data" => %{ "token" => token }}) do
    with {:ok, session} <- conn |> restore_passwordless_token(token) do
      Events.publish(:user_authenticated, session)

      # ...
    end
  end

  def create(conn, %{ "data" => params }) do
    with {:ok, data} <- conn |> build_passwordless_token(params) do
      Events.publish(:user_token_request, data)

      # ...
    end
  end
end
```

Our tests are now failing because the `origin` in our event is `nil`. We need to go update our `ApiCase` so it will set the `origin` header.

```elixir
# project/server/src/test/support/api_case.ex

defmodule GetSocialWeb.ApiCase do
  # ...

  setup tags do
    # ...

    conn = build_conn()
      # ...
      |> put_req_header("origin", "http://localhost:4200")

    # ...
  end

  # ...
end
```

We can now move onto setting up our email subscriber and sending the email. For that you'll need to check out the [email article](/articles/email/).

## Adding Auhentication Token Constraints

We want to put some limits on who can redeem the magic link token. To do that, we will add an additional claim to the JWT. This claim will be a "fingerprint" of the connection's `origin` and the `user-agent`. This means, in order for the user to redeem the token they have to visit the link from the same site and with the same browser. You might be tempted to add IP address to the mix, but, that could change between requests.

Like always, we'll start with the tests:

```elixir
# project/server/src/test/get_social_web/authentication_test.exs

defmodule GetSocialWeb.AuthenticationTest do
  # ...

  describe "restore_passwordless_token" do

    # ...

    test "constraints", %{ conn: conn } do
      conn1 = conn
        |> put_req_header("origin", "http://localhost:4200")
        |> put_req_header("user-agent", "Chrome")

      {:ok, %{ token: token1 }} = conn1
        |> Authentication.build_passwordless_token(%{ email: "user@example.com" })

      conn2 = conn
        |> put_req_header("origin", "http://example.com")
        |> put_req_header("user-agent", "Chrome")

      {:ok, %{ token: token2 }} = conn2
        |> Authentication.build_passwordless_token(%{ email: "user@example.com" })

      assert {:ok, _} = conn1 |> Authentication.restore_passwordless_token(token1)
      assert {:ok, _} = conn2 |> Authentication.restore_passwordless_token(token2)
      assert {:error, :invalid_token} = conn2 |> Authentication.restore_passwordless_token(token1)
      assert {:error, :invalid_token} = conn1 |> Authentication.restore_passwordless_token(token2)
    end
  end
end
```

Our new tests will verify that tokens cannot be restored unless the connection's `origin` and `user-agent` that is used to redeem the token is the same as the one that generated the token. With our failing tests we can now go update our implementation.

Luckily, that's only in a single spot. Our `build_passwordless_token_claims` method.

```elixir
defmodule GetSocialWeb.Authentication do
  # ...

  @spec build_passwordless_token_claims(Plug.Conn.t) :: {atom, map}
  def build_passwordless_token_claims(conn) do
    origin = conn |> Conn.get_req_header("origin")
    user_agent = conn |> Conn.get_req_header("user-agent")

    constraints = [origin, user_agent]

    fingerprint = :crypto.hash(:sha256, constraints)
      |> Base.encode16
      |> String.downcase

    {:ok, %{ typ: "otp", fp: fingerprint }}
  end
end
```