FROM ruby:2.7-slim as development

RUN apt-get update &&\
    apt-get install -y --no-install-recommends \
      build-essential \
      ruby-dev \
      git \
      curl

RUN curl -sL https://deb.nodesource.com/setup_14.x | bash - &&\
    apt-get install -y \
      nodejs

RUN gem install \
      sassc:'~> 2.3.0' \
      ffi:'~> 1.12.2'

WORKDIR /src

COPY Gemfile* ./
RUN bundle install

COPY package.* ./
RUN npm install --frozen-lockfile

FROM development as build
ENV JEKYLL_ENV=production
COPY . ./
RUN jekyll build --destination _site

FROM scratch as release
COPY --from=build /src/_site /