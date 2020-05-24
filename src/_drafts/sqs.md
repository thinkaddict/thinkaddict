---
title:
headline:
cover_image:
date: 2018-12-18 00:00:00 -0800
tags:
prerequisite_posts:
published: false
---

# SQS workers

- https://medium.com/zappos-engineering/sqs-throughput-over-https-with-elixir-f699a692ffc8
- https://labs.uswitch.com/genstage-for-continuous-job-processing/
- http://tomasztomczyk.com/2017/01/17/genstage-for-processing-jobs.html
- http://www.tattdcodemonkey.com/blog/2017/2/1/sqs-genstage


- https://medium.com/@andreichernykh/elixir-a-few-things-about-genstage-id-wish-to-knew-some-time-ago-b826ca7d48ba
- https://sheharyar.me/blog/understanding-genstage-elixir/
- https://elixirschool.com/en/lessons/advanced/gen-stage/

```
# lib/screencasts/application.ex

defmodule Screencasts.Application do
  # ...
  def start(_type, _args) do

    # ...

    children = [
      # ...
      # Start your own worker by calling: Screencasts.Worker.start_link(arg1, arg2, arg3)
      # worker(Screencasts.Worker, [arg1, arg2, arg3]),
    ]

    # ...
  end

  # ...
end
```
