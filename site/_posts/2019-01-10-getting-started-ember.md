---
title: Getting Started Ember
headline: Getting Started With Ember
cover_image: >-
  https://images.unsplash.com/photo-1526140684821-ac7437ed8349?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=500&h=280&q=80&crop=entropy
date: 2019-01-10 00:00:00 -0800
tags:
  - docker
  - emberjs
prerequisite_posts:
published: true
---

## Overview

My javascript framework of choice is [ember.js](https://emberjs.com/){: target="_blank"}. Ember has been stable since version 1.0 and the upgrade path has been a focus of the core ember team between backwards compatibility and code-mods. Keeping ember up to date is one of the most under appreciated features.

Let’s add a new “client” service to our docker compose config we built from the [phoenix getting started](/articles/getting-started/).

```yaml
# docker-compose.yml
version: '3.7'

# ...

services:
  # ...

  client:
    working_dir: /client/src
    build:
      context: ./client
      dockerfile: Dockerfile
    volumes:
      - type: bind
        source: ./client/src
        target: /client/src
      - node_modules:/client/src/node_modules
    tmpfs: /client/src/tmp
    depends_on:
      - server
    ports:
      - '4200:4200' # ember server
      - '7020:7020' # livereload
    command: 'ember server'

# ...

volumes:
  # ...
  node_modules:
```

Some important notes about the client service config, we are adding a `node_modules` volume to keep all installed modules local to the container and not install them in our host machine. We are also specifying a `tmpfs` at `/client/src/tmp` where all our tmp files are at to exclude them from being synced to our host maching and avoid slowing down our builds.

For our `client/Dockerfile` we will include chrome for the ember test suite and [watchman](https://facebook.github.io/watchman/){: target="_blank"} to automatically rebuild on file changes. Parts of this docker file are borrowed from [danlynn/ember-cli](https://github.com/danlynn/ember-cli). I wanted to build off of a `slim` image to keep our container size to a minimum, I’m also adding [ember-cli-update](https://github.com/ember-cli/ember-cli-update) to help keep our ember project up to date.

```dockerfile
# client/Dockerfile
FROM node:10.13-slim

### Install watchman build dependencies
RUN \
  apt-get update -y &&\
  apt-get install -y \
  autoconf \
  automake \
  build-essential \
  git \
  libssl-dev \
  libtool \
  pkg-config \
  python-dev

### set container bash prompt color to blue in order to
### differentiate container terminal sessions from host
### terminal sessions
RUN \
  echo 'PS1="\[\\e[0;94m\]${debian_chroot:+($debian_chroot)}\\u@\\h:\\w\\\\$\[\\e[m\] "' >> ~/.bashrc

### update yarn
RUN curl --compressed -o- -L https://yarnpkg.com/install.sh | bash

### install watchman
### Note: See the README.md to find out how to increase the
### fs.inotify.max_user_watches value so that watchman will
### work better with ember projects.
ENV WATCHMAN_VERSION v4.9.0
RUN \
  git clone https://github.com/facebook/watchman.git &&\
  cd watchman &&\
  git checkout ${WATCHMAN_VERSION} &&\
  ./autogen.sh &&\
  ./configure &&\
  make &&\
  make install

### install ember-cli
ENV EMBER_VERSION 3.8
RUN \
  yarn global add \
    ember-cli@${EMBER_VERSION} \
    ember-cli-update
```

Before we can start our new docker service, we need to create the `client/src` folder by adding a `client/src/.gitkeep` file.

Now we can run `docker-compose up --detach --build` to create our new ember client container.

Now we can generate our ember application. We will use [`ember init`](https://ember-cli.com/user-guide/#using-ember-cli){: target="_blank"} since we already have our project directory.

```shell
$ docker-compose run --rm client \
    ember init \
      --name get_social \
      --welcome false \
      --yarn true \
      --skip-bower true
```

We should be able to restart our client container with `docker-compose restart client` and visit [localhost:4200](http://localhost:4200){: .cc-active} to see our new ember application.

## Feature Flags

Once we have our ember project initialized, we need to set some feature flags. We can see the list of available feature flags by running:

```shell
$ docker-compose run --rm client \
    ember feature:list
```

At the time of writing (ember-cli: 3.7.1), these are the features we will be flagging.

**Template Only Glimmer Components**

> Introduce a low-level “flag” to remove the automatic wrapper &lt;div&gt; for template-only components (templates in the components folder that do not have a corresponding .js file).

```shell
$ docker-compose run --rm client \
    ember feature:enable \
      template-only-glimmer-components
```

**Application Template Wrapper**

> Introduce a low-level “flag” to remove the automatic wrapper &lt;div&gt; around Ember apps and tests.

```shell
$ docker-compose run --rm client \
    ember feature:disable \
      application-template-wrapper
```

**Disable jQuery Integration**

> For the past Ember has been relying and depending on jQuery. This RFC proposes making jQuery optional and having a well defined way for users to opt-out of bundling jQuery.

```shell
$ docker-compose run --rm client \
    ember feature:disable \
      jquery-integration
```

Then we need to remove jQuery from our `package.json`.

```shell
$ docker-compose run --rm client \
    yarn remove \
      @ember/jquery
```

With jQuery removed, we need to configure ember-data to use `fetch` instead of jQuery. This is done by adding [`ember-fetch`](https://github.com/ember-cli/ember-fetch#use-with-ember-data).

We will start by adding it to our `package.json`.

```shell
$ docker-compose run --rm client \
    yarn add \
      ember-fetch
```

And then configure our application adapter.

```shell
$ docker-compose run --rm client \
    ember g adapter application --pod
```

**NOTE**: I like to specify `--pod` for all generators except for `models`. This will group the files into the same folder as opposed to grouping them by type. (i.e. `app/application/adapter.js` vs `app/adapters/application.js`.

```javascript
// project/client/src/app/application/adapter.js

import DS from 'ember-data';
import AdapterFetch from 'ember-fetch/mixins/adapter-fetch';

export default DS.JSONAPIAdapter.extend(AdapterFetch, {
});
```

With our option flags set and ember-data configured to use fetch over jQuery, we can restart our client with `docker-compose restart client` and visit [localhost:4200](http://localhost:4200){: .cc-active} to see our new ember application.

To see what’s going on in our client container we can run `docker-compose logs -f client` to peek at the logs.

## Bootstrap

In the same vein of leveraging frameworks for our client and server applications, I like to use [bootstrap](https://getbootstrap.com/) for my CSS framework base. For component styling I’ve been using [`css-modules`](https://github.com/salsify/ember-css-modules) to help keep my component styles organized and prevent accidental side effects.

First, let’s install our dependencies.

```shell
$ docker-compose run --rm client \
    yarn add \
      sass@1.17.0 \
      ember-cli-sass@10.0.0 \
      ember-css-modules@1.1.0 \
      ember-css-modules-sass@1.0.1 \
      bootstrap@4.3.1
```

Now we need to rename our `styles/app.css` to `styles/app.scss` and import bootstrap:

```shell
$ mv client/src/app/styles/app.css client/src/app/styles/app.scss
```

```scss
// project/client/src/app/styles/app.scss

@import 'node_modules/bootstrap/scss/bootstrap';
```

Now we can restart our client with `docker-compose restart client` and visit [localhost:4200](http://localhost:4200){: .cc-active} to see our updated styles.

**NOTE:** `ember-css-modules-sass` is needed to make `ember-cli-sass` and `ember-css-modules` [play nice together](https://github.com/salsify/ember-css-modules/blob/master/docs/PREPROCESSORS.md).

## Test Suite Setup

We can also run the test suite with:

```shell
$ docker-compose run  --rm  --publish "7357:7357" client \
    ember test --server
```

And open [http://localhost:7357](http://localhost:7357){: .cc-active} to run the tests.

Let’s commit our changes and carry on.

```shell
$ git add . --all
$ git commit -m "adding ember project"
```

**Running Tests in CI Mode**

If you want to run the ember tests in the docker container without having to open chrome, you’ll need to install chrome with the `client/Dockerfile`.

```dockerfile
# client/Dockerfile

# ...

# install watchman
# ...

### install chrome for default testem config (as of ember-cli 2.15.0)
RUN \
  apt-get update &&\
  apt-get install -y \
    apt-transport-https \
    gnupg \
    --no-install-recommends &&\
  curl -sSL https://dl.google.com/linux/linux_signing_key.pub | apt-key add - &&\
  echo "deb [arch=amd64] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list &&\
  apt-get update &&\
  apt-get install -y \
    google-chrome-stable \
    --no-install-recommends

### tweak chrome to run with flags
RUN \
  sed -i 's/"$@"/-no-sandbox --disable-setuid-sandbox --headless --disable-gpu --remote-debugging-port=9222 "$@"/g' \
  /opt/google/chrome/google-chrome

# ...
```

With chrome installed in the container we can run our tests in `CI` mode which runs our tests in the container using chrome’s headless mode:

```shell
$ docker-compose run  --rm  --publish "7357:7357" -e CI=true client \
    ember test --server
```