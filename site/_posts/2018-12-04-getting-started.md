---
title: Getting Started
headline: Getting Started With Phoenix
cover_image: >-
  https://images.unsplash.com/photo-1491236149350-54bdab98dc14?ixlib=rb-0.3.5&ixid=eyJhcHBfaWQiOjEyMDd9&s=54bce91e378fdfddc9dda4e7616ca461&auto=format&fit=crop&w=500&h=280&q=80&crop=entropy
date: 2018-12-04 00:00:00 -0800
tags:
  - elixir
  - docker
prerequisite_posts:
published: true
---

## Overview

New computers happen, language versions, dependency versions, os updates, or a new hotness framework comes out. All of these are a time suck when maintaining a project, especially the various “side projects” that get put on the back burner.

One of the things I want to focus on is “future-proofing” my process. I’ve burned so many hours trying to figure out how to install and upgrade things, cyber spelunking through outdated stack overflow articles and abandoned blog posts. Yet, I’ve never considered something like docker. I’m not much for the bandwagon, and I’m to old to ride any hype trains; so I’ve never really seen the value of docker. I’ve always been under the impression docker was only used if you’re deploy servers to production.

Admittedly, this article is my first go at docker and it’s very much still voodoo to me. However, after putting this article together, I can say, it is in my utility belt to stay.

## Docker

I’m not going to go into detail on what docker actually is, there’s plenty of other sources online that you should look at. For the purposes of this article, we are going to setup a Postgres container and an elixir/phoenix container that we will use to run and build our phoenix project.

```shell
$ docker -v
Docker version 18.09.0, build 4d60db4

$ docker-compose -v
docker-compose version 1.23.1, build b02f1306
```

Installation is pretty quick an easy (at least on a [mac](https://docs.docker.com/docker-for-mac/install/){: target="_blank"}). I prefer to develop on a mac, but, you can also install docker on a [windows](https://docs.docker.com/docker-for-windows/install/){: target="_blank"} machine.

Once you have docker installed and running on your machine, we will need to create three files in our project directory. Or project structure will ultimatley look something like this:

```
└── project/
    ├── server/
    │   ├── src/
    │   ├── .env
    │   └── Dockerfile
    ├── client/
    │   ├── src/
    │   ├── .env
    │   └── Dockerfile
    └── docker-compose.yml
```

**NOTE: fine tune mono-repo vs submodules**The project will consist of a **server** and a **client**. This structure will easily allow us to have a mono-repo, or, a `project` repo with `client` and `server` submodules. This structure is extremely important when we use submodules as we will need to mount the `.git` folder in our containers and retain the depth of the actual project files. Otherwise you will run into issues with things like `yarn install` when it tries to find the `git` folder for the `client` and `server`.

```yaml
# docker-compose.yml
version: '3.7'

services:
  db:
    image: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data

  server:
    working_dir: /server/src
    env_file:
      - ./server/.env
    build:
      context: ./server
      dockerfile: Dockerfile
    volumes:
      - type: bind
        source: ./server/src
        target: /server/src
    depends_on:
      - db
    ports:
      - "4000:4000"
    command: 'mix phx.server'

volumes:
  pgdata:
```

```dockerfile
# server/Dockerfile
FROM elixir:1.7-slim

# install phoenix 1.4.0
RUN mix local.hex --force &&\
    mix local.rebar --force &&\
    mix archive.install --force hex phx_new 1.4.0
```

In addition to our `server/Dockerfile` we need to create two more files:

* `server/.env`
* `server/src/.gitignore`

Now we can run `docker-compose up -d --build` to create our Postgres database and elixir development containers (-d is short for –detach).

Once our containers are running we can execute shell commands in them by running `docker-compose run --rm SERVICE COMMAND`.

**Verify Postgres**

```shell
$ docker-compose run --rm db psql --version
psql (PostgreSQL) 11.1 (Debian 11.1-1.pgdg90+1)

$ docker-compose run --rm db pg_isready
/var/run/postgresql:5432 - accepting connections
```

**Verify Elixir and Phoenix**

```shell
$ docker-compose run --rm server elixir -v
Erlang/OTP 21 [erts-10.1.2] [source] [64-bit] [smp:4:4] [ds:4:4:10] [async-threads:1] [hipe]

Elixir 1.7.4 (compiled with Erlang/OTP 21)

$ docker-compose run --rm server mix phx.new -v
Phoenix v1.4.0
```

With our development environment setup, let’s save our work to a git repo:

```shell
$ git init
$ git add . --all
$ git commit -m "initial commit"
```

## Generate a new Phoenix Server

Now that we have a container running elixir and phoenix, let’s use it to generate new phoenix project.

* [Phoenix Up and Running](https://hexdocs.pm/phoenix/up_and_running.html){: target="_blank"}
* [mix phx.new](https://hexdocs.pm/phoenix/Mix.Tasks.Phx.New.html){: target="_blank"}

```shell
$ docker-compose run --rm server mix phx.new . \
    --module GetSocial \
    --app get_social \
    --database postgres \
    --no-html \
    --binary-id \
    --no-webpack
```

You will be prompted with a warning `The directory /app already exists. Are you sure you want to continue? [Yn]`, press `Y`, this is what we want. 

Before we can create our database, we need to update the `server/src/config/dev.exs` and `server/src/config/test.exs` files and set the database hostname to `db` to match our docker service name in the `docker-compose.yml`.

With that, we can create our database:

```shell
$ docker-compose run --rm server mix ecto.create
```

## Starting Phoenix

Our `server` container will run `mix pxh.server` on startup. Until now, the container would stop immediatley because we havent had a properly configured phoenix server.

You can see which containers are running by using:

```shell
$ docker-compose ps
```

Let’s start it up.

```shell
$ docker-compose start server
```

After starting our server we can visit [localhost:4000](http://localhost:4000){: .cc-active target="_blank"} and get Phoenix’s missing route error page.

You can check the server logs by running `docker-compose logs -f server`

Eventually you will need to restart the phoenix server, to do this you run `docker-compose restart server`.

## Running Tests

After we’ve confirmed the server runs, let’s run our tests using:

```shell
$ docker-compose run --rm server mix test
```

Once our tests have passed, the next thing we will do is have our tests run automatically anytime we make a change to our project files.

To do this, we will use the [`mix test.watch`](https://github.com/lpil/mix-test.watch) library.

```elixir
# server/mix.exs

defmodule GetSocial.MixProject do
  # ...

  defp deps do
    [
      # ...
      {:mix_test_watch, "~> 0.8", only: :dev, runtime: false}
    ]
  end

  # ...
end
```

then update our mix dependencies…

```shell
$ docker-compose run --rm server mix deps.get
```

If we run `docker-compose run --rm server mix test.watch` we will get an error stating `inotify-tools is needed to run file_system`

To add `inotify-tools` we need to update our `server/Dockerfie`.

```dockerfile
# server/Dockerfile
# ...

# install `inotify-tools` for `mix test.watch`
RUN apt-get update \
    && apt-get install -y inotify-tools

# install phoenix 1.4.0
# ...

# migrate and start phoenix on start
# ...
```

With this added we need to rebuild our containers:

```shell
$ docker-compose up -d --build
```

If we run `docker-compose run --rm server mix test.watch` again we will see that everything is working as expected. We can also update any file in our phoenix project to trigger the tests to auto run.

Now that we have a fresh phoenix installation, tested the server, and have passing tests, let’s save our work:

```shell
$ git add . --all
$ git commit -m "adding phoenix project"
```