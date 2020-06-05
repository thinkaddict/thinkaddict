FROM ruby:2.7-slim as development

RUN apt-get update &&\
    apt-get install -y --no-install-recommends \
      build-essential \
      ruby-dev

WORKDIR /src

ENV LC_ALL=C.UTF-8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US.UTF-8
ENV TZ=America/Los_Angeles

COPY Gemfile* ./
RUN bundle install

FROM development as build

ENV JEKYLL_ENV=production

COPY . ./

RUN bundle exec jekyll build --destination _site

FROM scratch as release
COPY --from=build /src/_site /