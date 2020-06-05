---
title: CORS
headline: CORS
cover_image: >-
  https://images.unsplash.com/photo-1533133759442-331c8f59fbe4?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&s=f0ffbc89619c4b9daa94cf6a11249202&auto=format&fit=crop&w=500&h=280&q=80
date: 2018-12-18 00:00:00 -0800
tags:
prerequisite_posts:
published: false
---

## Overview

> Cross-Origin Resource Sharing (CORS) is a mechanism that uses additional HTTP headers to tell a browser to let a web application running at one origin (domain) have permission to access selected resources from a server at a different origin. A web application makes a cross-origin HTTP request when it requests a resource that has a different origin (domain, protocol, and port) than its own origin.


- https://github.com/whatyouhide/corsica
- https://hexdocs.pm/corsica/Corsica.html


```elixir
# mix.exs

defp deps do
  [
    # ...
    {:corsica, "~> 1.1"}
  ]
end
```

```elixir
# config/config.exs

# Configures CORS
config :get_social,
  allowed_origins: [
    "http://localhost:4200"
  ],
  corsica_log_level: [rejected: :warn]
```

```elixir
# lib/screencasts_web/endpoint.ex

plug Plug.Head

plug Corsica, [
  origins: Application.get_env(:get_social, :allowed_origins),
  allow_headers: [
    "accept",
    "authorization",
    "content-type",
    "origin",
    "x-requested-with"
  ],
  max_age: 600,
  log: Application.get_env(:get_social, :corsica_log_level)
]

plug ScreencastsWeb.Router
```


