---
title: Password Authentication with Ember
headline:
cover_image: >-
  https://images.unsplash.com/photo-1522251670181-320150ad6dab?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&s=54bce91e378fdfddc9dda4e7616ca461&auto=format&fit=crop&w=500&h=280&q=80&crop=entropy
date: 2018-12-18 00:00:00 -0800
tags:
  - emberjs
  - testing
prerequisite_posts:
  - 2019-02-09-getting-started-ember
  - 2019-01-08-passwordless-authentication
published: true
---

## Overview

We are going to start building out our client side ember application starting with authenticating our user. This will build off of our Phoenix server work done in the [passwordless authentication](/passwordless-authentication/) article.

First up we need to install a couple of dependencies to make testing in ember a little easier:

* [`ember-sinon`](https://github.com/csantero/ember-sinon) that we will use to test that our components trigger actions.
* [`ember-test-selectors`](https://github.com/simplabs/ember-test-selectors) that allows us to use `data-test-*` attributes for selectors instead of CSS classes. This addon will also remove all `data-test-*` attributes for our production build.
* [`qunit-dom`](https://github.com/simplabs/qunit-dom) to give us higher level assertions to make our tests a little easier to read.

```shell
$ docker-compose run --rm client \
    yarn add --dev \
      ember-sinon \
      ember-test-selectors \
      qunit-dom
```

With our new test dependencies install we will need to restart our client with `docker-compose restart client`. Now, we can start our test server in CI mode with:

```shell
$ docker-compose run  --rm  --publish "7357:7357" -e CI=true client \
    ember test --server
```

In CI mode, our tests will run in the background using chrome's headless mode. You can also run the tests in your browser by visiting [localhost:7357](http://localhost:7357){: .cc-active}.

## Login Form Component

Our login component will be responsible for validating the users input and requesting the passwordless token.

First, let's generate the component and write some tests.

```shell
$ docker-compose run --rm client \
    ember g component login-form \
      --pod
```

Our tests will define a basic implementation that triggers the action when the user clicks the submit button.

```javascript
// project/client/src/tests/integration/components/login-form/component-test.js

import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, fillIn, click } from '@ember/test-helpers';
import sinon from 'sinon';
import hbs from 'htmlbars-inline-precompile';

module('Integration | Component | login-form', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(async function () {
    this.success = sinon.spy();

    await render(hbs`
      <LoginForm @onsuccess={{success}}/>
    `);
  });

  test('it renders', async function (assert) {
    assert.dom('[data-test-input="email"]').exists();
    assert.dom('[data-test-submit]:disabled').exists();
  });

  test('it calls success', async function(assert) {
    await fillIn('[data-test-input="email"]', 'user@example.com');
    await click('[data-test-submit]:enabled');

    sinon.assert.calledOnce(this.success);
    assert.expect(0);
  });
});
```

Now we can implement our component starting with the teamplate.

```handlebars
{% raw %}
{{!-- project/client/src/app/components/login-form/template.hbs --}}
<form onsubmit={{action "authenticate"}}>

  <div class="form-group">
    <label for="identification">Email</label>

    {{input
      class="form-control"
      data-test-input="email"
      id="identification"
      placeholder="Email"
      type="email"
      value=email
    }}
  </div>

  <button
    class="btn btn-primary"
    data-test-submit
    disabled={{unless email "disabled" }}
    type="submit"
  >
    Login
  </button>
</form>
{% endraw %}
```

Our tests are now failing because we have not defined the `authenticate` action. Let's go add that to our components javascript.

```javascript
// project/client/src/app/components/login-form/component.js
import Component from '@ember/component';

export default Component.extend({

  // our default `onsuccess` param incase one is not passed
  onsuccess() {},

  actions: {
    async authenticate(event) {
      // we need to return false to cancel the native form submission
      event.preventDefault();

      // call our `onsuccess` callback
      this.onsuccess();
    }
  }

});
```

With our basic login form built, we can write the acceptance test for our `/login` route. We will handle validation and server responses later.

## Acceptance Test

For our initial test, We want our user to:

* Visit `/login`
* Type in their email address
* Click submit
* See a message telling them to check their email

Let's generate a new acceptance test:

```shell
$ docker-compose run --rm client \
    ember g acceptance-test authentication
```

```javascript
// project/client/src/tests/acceptance/authentication-test.js

import { module, test } from 'qunit';
import { visit, currentURL, fillIn, click } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | authentication', function(hooks) {
  setupApplicationTest(hooks);

  test('visiting /login', async function(assert) {
    await visit('/login');
    await fillIn('[data-test-input="email"]', 'user@example.com');
    await click('[data-test-submit]');

    assert.equal(currentURL(), '/login');
    assert.dom('[data-test-message]').hasText('check your email');
    assert.dom('[data-test-input="email"]').doesNotExist();
  });

});
```

Our tests will fail because we do not have a `/login` route, so, let's generate it. We will add the `--pod` flag so our template and route file are in the same folder.

```shell
$ docker-compose run --rm client \
    ember g route login \
      --pod
```

Now are tests are failing because there's no `[data-test-input]` or `[data-test-submit]`. These exist in the `login-form` component we just built. We will use our components action to toggle our `messageSent` flag.

```handlebars
{% raw %}
{{!-- project/client/src/app/login/template.hbs --}}
<div class="container">
  <div class="row vh-100 align-items-center justify-content-center">
    <div class="col-md-6">

      <h2>Sign In</h2>

      {{#if messageSent}}
        <div data-test-message="">
          check your email
        </div>
      {{else}}
        <LoginForm @onsuccess={{action "success"}}/>
      {{/if}}

    </div>
  </div>
</div>
{% endraw %}
```

To support the `success` action and `messageSent` flag, we will need a controller:

```shell
$ docker-compose run --rm client \
    ember g controller login \
      --pod
```

Luckily, our controller logic is pretty basic, `messageSent` will be set to `true` when our `success` action is triggered by our component.

```javascript
// project/client/src/app/login/controller.js
import Controller from '@ember/controller';

export default Controller.extend({

  messageSent: false,

  actions: {
    success() {
      this.set('messageSent', true);
    }
  }
});
```

You should now be able to visit [localhost:4200/login](http://localhost:4200/login){: .cc-active} and see our fancy login form.

## Input Validation

Unfortunatly, we can't rely on the users to provide the right data all the time, so, let's add some input validation. To handle validations we will leverage [ember-changeset-validations](https://github.com/poteto/ember-changeset-validations).

```shell
$ docker-compose run --rm client \
    yarn add \
      ember-changeset-validations
```

We now have to restart our server and test runner:

```shell
$ docker-compose restart client
$ docker-compose run  --rm  --publish "7357:7357" -e CI=true client \
    ember test --server
```

Now we need to open up our login form component test so we can write some new tests for the input validation. We want to make sure that we are getting a valid email address and that the submit button is disabled while the form is invalid.

```javascript
// project/client/src/tests/integration/components/login-form/component-test.js

// ...

module('Integration | Component | login-form', function(hooks) {
  // ...

  module('it validates', function () {
    test('when blank', async function(assert) {
      await fillIn('[data-test-input="email"]', '');

      assert.dom('[data-test-input="email"]').hasClass('is-invalid');
      assert.dom('[data-test-hint="email"]').hasText('Email must be a valid email address');
      assert.dom('[data-test-submit]:disabled').exists();
    });

    test('format', async function(assert) {
      await fillIn('[data-test-input="email"]', 'user');

      assert.dom('[data-test-input="email"]').hasClass('is-invalid');
      assert.dom('[data-test-hint="email"]').hasText('Email must be a valid email address');
      assert.dom('[data-test-submit]:disabled').exists();
    });
  });
});
```

As expected, our tests are now failing. Let's add our validation logic to make the world right again.

```javascript
// project/client/src/app/components/login-form/component.js
import Component from '@ember/component';
import Changeset from 'ember-changeset';
import lookupValidator from 'ember-changeset-validations';
import { validateFormat } from 'ember-changeset-validations/validators';
import { computed } from '@ember/object';
import { or } from '@ember/object/computed';

export default Component.extend({

  init() {
    this._super(...arguments);

    this.validations = {
      email: [
        validateFormat({ type: 'email' })
      ]
    };
  },

  email: null,

  _changeset: computed('email', 'validations', function () {
    let { email, validations } = this;
    let model = { email };

    return new Changeset(model, lookupValidator(validations), validations);
  }),

  _submitDisabled: or('_changeset.isInvalid', '_changeset.isPristine'),

  onsuccess() {},

  actions: {
    async authenticate(event) {
      event.preventDefault();

      if (this._changeset.isValid) {
        this.onsuccess();
      }
    }
  }

});
```

Now we need to update our template to show the `ember-changeset-validation` errors.

```handlebars
{% raw %}
<form onsubmit={{action "authenticate"}}>
  <div class="form-group">
    <label for="identification">Email</label>

    {{input
      class=(if (get _changeset.error "email") "form-control is-invalid" "form-control")
      data-test-input="email"
      id="identification"
      placeholder="Email"
      type="email"
      value=_changeset.email
    }}

    {{#if _changeset.error.email}}
      <div class="invalid-feedback" data-test-hint="email">
        {{ _changeset.error.email.validation }}
      </div>
    {{/if}}
  </div>

  <button
    class="btn btn-primary"
    data-test-submit
    disabled={{if _submitDisabled "disabled" }}
    type="submit"
  >
    Login
  </button>
</form>
{% endraw %}
```

Now we have a component that accepts user input, validates it, and then calls our `onsuccess` parameter when the form submission completes. Next we need to wire up our component so it talks to our API and actually requests the passwordless token.

First, though, we should probably commit our changes:

```shell
$ git commit -am "Adding LoginForm component and validations"
```

## Requesting A Passwordless Token

We will be working with the API we built in [Passwordless Authentication and Magic Links](/articles/passwordless-authentication/). The endpoint for requesting a token is `POST /api/sessions` which expects an `email` or `token` parameter but not both.

Some things to remember abut our session api.

* Passing an `email` parameter will request the `token`, but, no data is returned.
* Passing the `token` parameter will return a `session` with an `auth-token` to be used for authentication.
* We should never send the `auth-token` back to the server with a session payload.

With our memory refreshed, let's create our `Session` model:

```shell
$ docker-compose run --rm client \
    ember g model session \
      email:string \
      token:string \
      auth-token:string
```

Let's then write a unit test to ensure our session has the expected attributes and types:

```javascript
// project/client/src/tests/unit/models/session-test.js
import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';

module('Unit | Model | session', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.store = this.owner.lookup('service:store');
    this.subject = this.store.createRecord('session', {});
  });

  test('definitions', function (assert) {
    let attributes = {};

    this.subject.eachAttribute((property, { type }) => attributes[property] = type);

    assert.deepEqual(attributes, {
      email: 'string',
      token: 'string',
      authToken: 'string'
    });
  });
});
```

To ensure our `email` or `token` are sent to the server, we need to generate a serializer for our session model.

```shell
$ docker-compose run --rm client \
    ember g serializer session
```

Now we can write some tests to verify the session payload we will be sending to the server.

```javascript
// project/client/src/tests/unit/serializers/session-test.js
import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';

module('Unit | Serializer | session', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.store = this.owner.lookup('service:store');
    this.serializer = this.store.serializerFor('session');
  });

  test('it exists', function(assert) {
    assert.ok(this.serializer);
  });

  test('it serializes', function(assert) {
    let record = this.store.createRecord('session', { authToken: '12345' });
    let serializedRecord = record.serialize();

    assert.deepEqual(serializedRecord, {
      'data': {
        'attributes': {},
        'type': 'sessions'
      }
    });
  });

  test('it serializes email', function(assert) {
    let record = this.store.createRecord('session', { email: 'user@example.com' });
    let serializedRecord = record.serialize();

    assert.deepEqual(serializedRecord, {
      'data': {
        'attributes': {
          'email': 'user@example.com'
        },
        'type': 'sessions'
      }
    });
  });

  test('it serializes token', function(assert) {
    let record = this.store.createRecord('session', { email: 'user@example.com', token: 'token' });
    let serializedRecord = record.serialize();

    assert.deepEqual(serializedRecord, {
      'data': {
        'attributes': {
          'token': 'token'
        },
        'type': 'sessions'
      }
    });
  });

});
```

And of course, our tests are failing. The interesting thing about these failing tests is that our data is serialized as `null` when theres no value. This is because we have defined our `Session` attributes as `string`. If we were to instead define our session attributes as `DS.attr()` they would be serialized as `undefined` and not sent to the server.

I've opted to explicitly set the attribute types for clarity and to save myself some headaches if this behaviour changes in the future.

Let's go update our session serializer to fix these tests.

```javascript
// project/client/src/app/serializers/session.js
import DS from 'ember-data';

export default DS.JSONAPISerializer.extend({

  attrs: {
    authToken: { serialize: false }
  },

  serialize() {
    let serialized = this._super(...arguments);
    let { attributes } = serialized.data;

    // remove email if empty or we have a token
    if (!attributes.email || attributes.token) {
      delete attributes.email;
    }

    // remove token if empty or we have an email
    if (!attributes.token || attributes.email) {
      delete attributes.token;
    }

    return serialized;
  }
});
```

Here we've told the serializer to never serialize the `authToken` attribute. We've also overriden the `serialize` method to remove the `email` and `token` if they are empty, or, the other attribute exists.

Now that we have defined our `session` model behaviour, we can update our login form component to create a session record and send it to our API.

First, we are going to update our `it calls succss` test to expect the `success` callback is called with an instance of a `Session` model.

```javascript
// ...

import Session from 'get-social/models/session';

module('Integration | Component | login-form', function(hooks) {
  // ...

  test('it calls success', async function(assert) {
    // ...

    sinon.assert.calledWith(this.success, sinon.match.instanceOf(Session));

    // ...
  });

  // ...
});
```

Now let's go update our component to create and send the `Session` model.

```javascript
// project/client/src/app/components/login-form/component.js

// ...
import { inject as service } from '@ember/service';

export default Component.extend({

  // ...

  store: service(),

  // ...

  actions: {
    async authenticate(event) {
      // ...

      if (this._changeset.isValid) {
        let { data } = this._changeset.execute();
        let session = this.store.createRecord('session', data);

        await session.save();

        this.onsuccess(session);
      }
    }
  }
});
```

Now our tests are failing with `404` errors because our ember app is trying to call our API endpoint on itself instead of our server. This bigger issue is, these are tests, we don't wannt to make live requests. To handle for this, we will leverage [`ember-cli-mirage`](https://www.ember-cli-mirage.com/) to mock all of our HTTP requests.

## EmberCLI Mirage

> A client-side server to help you build, test and demo your Ember app

Let's install ember-cli-mirage and get our tests fixed. We need to install `ember-cli-mirage` with `ember install`, if we used `yarn` directly, it will not run the addon's install scripts which generate the `mirage` folder and base configuration.

```shell
$ docker-compose run --rm client \
    ember install ember-cli-mirage
```

Once mirage is installed, we'll need to restart our client and test containers.

```shell
$ docker-compose restart client
$ docker-compose run  --rm  --publish "7357:7357" -e CI=true client \
    ember test --server
```

EmberCLI Mirage only runs automatically on acceptance tests which means we need to [manually start it](https://www.ember-cli-mirage.com/docs/cookbook/manually-starting-mirage) for our integration test.

```javascript
// project/client/src/tests/integration/components/login-form/component-test.js

// ...
import { startMirage } from 'get-social/initializers/ember-cli-mirage';

module('Integration | Component | login-form', function(hooks) {
  // ...

  hooks.beforeEach(function () {
    this.server = startMirage();
    this.server.logging = true;
  });

  hooks.afterEach(function () {
    this.server.shutdown();
  });

  // ...
});
```

We should now be able to reload our test runner and see a new error from mirage saying:

```
Mirage: Your Ember app tried to POST '/sessions',
  but there was no route defined to handle this request.
  Define a route that matches this path in your
  mirage/config.js file. Did you forget to add your namespace?
```

Let's go mock the `POST /sessions` request in our integration test.

```javascript
// project/client/src/tests/integration/components/login-form/component-test.js

// ...

module('Integration | Component | login-form', function(hooks) {

  // ...

  test('it calls success', async function(assert) {
    this.server.post('/sessions', { data: null }, 201);

    // ...
  });

  // ...
});
```

Our acceptance test is now failing because of the same issue. Let's go mock the request there too:

```javascript
// ...
import setupMirage from 'ember-cli-mirage/test-support/setup-mirage';

module('Acceptance | authentication', function(hooks) {
  // ...
  setupMirage(hooks);

  test('visiting /login', async function(assert) {
    server.post('/sessions', { data: null }, 201);

    // ...
  });
});
```

Now we are getting an ember error stating:

```
Assertion Failed: Your session record was saved to the server, but the response does not have an id and no id has been set client side. Records must have ids. Please update the server response to provide an id in the response or generate the id on the client side either before saving the record or while normalizing the response.
```

This is because our API returns an empty response. To get around this, we will create a `session` adapter and override the [`generateIdForRecord`](https://www.emberjs.com/api/ember-data/3.8/classes/DS.Adapter/methods/generateIdForRecord?anchor=generateIdForRecord) method to generate an id on the client. The key is, we only want to generate the id when our model does not have the `token` set. When we send the token back to the server, we expect to get a session response that will have the `id` and `auth-token`.

Let's generate our adapter and write some tests:

```shell
$ docker-compose run --rm client \
    ember g adapter session
```

After we generate the session adapter, we now have another error!

```
Cannot read property 'ajax' of undefined
```

Don't worry, this is because we've removed jQuery from our application. We just need to extend our `ApplicationAdapter` instead of `DS.JSONAPIAdapter`. Before we do that, let's write some unit tests for our session adapter. One of those tests will assert that we are extending the application adapter.

```javascript
// project/client/src/tests/unit/adapters/session-test.js

import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import ApplicationAdapter from 'get-social/application/adapter';

module('Unit | Adapter | session', function(hooks) {
  setupTest(hooks);

  module('#generateIdForRecord', function({ beforeEach }) {

    beforeEach(function () {
      this.adapter = this.owner.lookup('adapter:session');
    });

    test('extends application adapter', function (assert) {
      assert.ok(this.adapter instanceof ApplicationAdapter);
    });

    test('generates id when token is empty', function (assert) {
      assert.ok(this.adapter.generateIdForRecord(null, null, {}));
    });

    test('does not generate id when token is provided', function (assert) {
      assert.notOk(this.adapter.generateIdForRecord(null, null, { token: '1234' }));
    });

  });
});
```

We now have failing tests for our `Unit | Adapter | session` suite. Let's focus on fixing those.

```javascript
// project/client/src/app/adapters/session.js

import ApplicationAdapter from '../application/adapter';

export default ApplicationAdapter.extend({

  /*
    When creating a session with an email, we get a 200 with no content, so a client side Id is needed to Ember doesnt complain.
    Do not generate an Id when creating a session with a token (since the id is returned from the server).
  */
  generateIdForRecord(_store, _type, { token }) {
    if (!token) {
      return Date.now().toString(16);
    }
  }

});
```

All of our tests should now be passing! However, if we visit our application in the browser and try to request a passwordless token, our requests fail with Mirage errors. This is because EmberCLI Mirage is enabled by default in `development` and `test` environments. We could [disable it in our config](http://www.ember-cli-mirage.com/docs/advanced/environment-options#enabled), but, a better solution is setting the [`passthrough`](http://www.ember-cli-mirage.com/docs/quickstart#passthrough).

Let's configure the passthrough:

```javascript
// project/client/src/mirage/config.js
export default function() {
  // ...

  this.passthrough();
}
```

If we attempt to request our passwordless token from our browser, we get a `404` error. This is because ember-data still thinks our api endpoints are on the same host as our ember application. We need to go configure the `host` and `namespace` on our `ApplicationAdapter`.

Before we do that, let's write the tests. We're actually going to specify the `namespace` and `host` in our `project/client/src/config/environment.js` file:

```javascript
// project/client/src/config/environment.js

module.exports = function(environment) {
  let ENV = {
    // ...

    API: {
      host: 'http://local.thinkaddict.com:4000',
      namespace: 'api'
    }
  };

  // ...
};
```

Now we can reuse the environment configuration in our tests and code.

```javascript
// project/client/src/tests/unit/adapters/application-test.js

import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import config from 'get-social/config/environment';

const { host, namespace } = config.API;

module('Unit | Adapter | application', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.adapter = this.owner.lookup('adapter:application');
  });

  test('has namespace and host configured', function(assert) {
    assert.equal(this.adapter.host, host);
    assert.equal(this.adapter.namespace, namespace);
  });
});
```

```javascript
// project/client/src/app/application/adapter.js

import DS from 'ember-data';
import AdapterFetch from 'ember-fetch/mixins/adapter-fetch';
import config from 'get-social/config/environment';

const { host, namespace } = config.API;

export default DS.JSONAPIAdapter.extend(AdapterFetch, {
  host,
  namespace
});
```

Whelp, now EmberCLI Mirage is complaining with an error we've seen before:

```
Mirage: Your Ember app tried to POST 'http://local.thinkaddict.com:4000/api/sessions',
  but there was no route defined to handle this request.
  Define a route that matches this path in your
  mirage/config.js file. Did you forget to add your namespace?
```

This is because we've changes the `namespace` and `host` configuration for our API. We just need to go update the mirage configuration for our [passthrough](http://www.ember-cli-mirage.com/docs/api/modules/ember-cli-mirage/server~Server#passthrough).

```javascript
// project/client/src/mirage/config.js

import config from 'get-social/config/environment';

const { host, namespace } = config.API;

export default function() {
  this.urlPrefix = host;
  this.namespace = namespace;
  this.passthrough(`${host}/**`);
}
```

Phew, that was close. Now let's try to manually test our login again through the browser. Since we've updated the environment configuartion, we will have to restart out client container. Once thats done, visit [localhost:4200/login](http://localhost:4200/login){: .cc-active} in your browser.

```
415 (Unsupported Media Type)
```

Wait. What?. [Let me Google that.](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/415)

> The format problem might be due to the request's indicated Content-Type or Content-Encoding, or as a result of inspecting the data directly.

Oh! Our `Content-Type` is `application/json`, but, our phoenix server expects `application/vnd.api+json`. Luckily ember-data makes this easy to fix by overriding the [`headers`](https://www.emberjs.com/api/ember-data/3.8/classes/DS.JSONAPIAdapter/properties/headers?anchor=headers) property in our application adapter.

But, first, tests.

```javascript
// ...

module('Unit | Adapter | application', function(hooks) {

  // ...

  test('sets headers', function(assert) {
    assert.deepEqual(this.adapter.headers, {
      'accept': 'application/vnd.api+json',
      'content-type': 'application/vnd.api+json'
    });
  });

});
```

Now, the fix.

```javascript
// project/client/src/app/application/adapter.js

// ...

import { computed } from '@ember/object';

// ...

export default DS.JSONAPIAdapter.extend(AdapterFetch, {

  // ...

  headers: computed(function () {
    return {
      'accept': 'application/vnd.api+json',
      'content-type': 'application/vnd.api+json'
    };
  })

});
```

Ok. Our tests are passing again, let's try in our browser again. Everything should be working as expected. Now we need to handle our magic link and redeem the passwordless token.

## Redeeming the token

If we request a token through our browser and then visit our [bamboo dashboard](htt://localhost:4000/messages) we should see a message waiting in the inbox. The message should have a link that looks like this:

```
http://localhost:4200/auth/eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJnZXRfc29jaWFsIiwiZXhwIjoxNTUxNTc1NTQ3LCJmcCI6IjRmZWNlMmFjMzI5YTUxNzk1MzIzNmE1YzNmMmEyYmMzMzYxNzM1NGQ3MzI2NzZkMmQyNGFjMTViZGM2MzE0NDIiLCJpYXQiOjE1NTE1NzUyNDcsImlzcyI6ImdldF9zb2NpYWwiLCJqdGkiOiIzZWE4ZjExMi0zOTEzLTQ1YTktYmNjNS0xNzk3M2M4YmI1YjAiLCJuYmYiOjE1NTE1NzUyNDYsInN1YiI6InNhbUBoYXJuYWNrc3R1ZGlvcy5jb20iLCJ0eXAiOiJvdHAifQ.41L5KG7Ww5loGSAU--8jq-ZoOc9X3BvCtTzDKnIjQyXWQ6zyt-TqgPFNitlgIXTQOXRiYqGQfQuNzdAQV6b7BQ
```

We need to create a new route in our ember application to handle for `/auth/:token`. Let's update our authentication acceptance test.

```javascript
// project/client/src/tests/acceptance/authentication-test.js

// ...

module('Acceptance | authentication', function(hooks) {
  // ...

  module('visiting /auth/:token', function () {
    test('with valid token', async function(assert) {
      // exchange our token for an auth-token
      server.post('/sessions', {
        data: {
          id: 'USERID',
          attributes: {
            'email': 'user@example.com',
            'auth-token': 'AUTHTOKEN'
          },
          type: 'sessions'
        }
      });

      // get our current user details
      server.get('/accounts/USERID', {
        data: {
          id: 'USERID',
          attributes: {
            'email': 'user@example.com'
          },
          type: 'accounts'
        }
      });

      await visit('/auth/12345');

      assert.equal(currentURL(), '/dashboard');
      assert.dom('[data-test-user="USERID"]').hasText('user@example.com');
    });
  });

  // ...
});
```

We've added a new test for when a user visits the auth url, they should be redirected to `/dashboard` and see their email address indicating that they've successfully logged in. We've also mocked two API calls, one to exchange our `token` for an `auth-token` and another to retrieve our account details.

Naturally, our tests fail because there's no route to handle `/auth/:token`. Let's start off by generating it, while we're at it, let's generate our `dashboard` route too.

```shell
$ docker-compose run --rm client \
    ember g route token \
      --path "/auth/:token" \
      --pod
$ docker-compose run --rm client \
    ember g route dashboard \
      --pod
```

Next we need to exchange the `:token` for an `authToken` and redirect the user to their dashboard. First, we will add override the `model` property and create a new session record with our `token` which calls our API to get the `auth-token`. We are also introducing a new `current-user` service that will handle taking our `session` and convert it to an `account` along with authenticating our API requests.

```javascript
// project/client/src/app/token/route.js

import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({

  currentUser: service(),

  model({ token }) {
    return this.store.createRecord('session', { token }).save();
  },

  afterModel(session) {
    return this.currentUser.authenticateSession(session);
  }

});
```

We now have a `session` instance that has our user's `auth-token` and are passing it to our yet to be created `current-user` service's `authenticateSession` method.

Let's build out a MVP user service.

```shell
$ docker-compose run --rm client \
    ember g service current-user
```

Our `current-user` service will be making the call to `GET /accounts/USERID` to retrieve our `account` for which we will need an ember data model. For now, our account will just have an `email` attribute.

```shell
$ docker-compose run --rm client \
    ember g model account \
      email:string
```

Here's our initial tests.

```javascript
// project/client/src/tests/unit/services/current-user-test.js

import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import { startMirage } from 'get-social/initializers/ember-cli-mirage';

module('Unit | Service | current-user', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.service = this.owner.lookup('service:current-user');
  });

  module('when authenticated', function ({ beforeEach, afterEach }) {

    beforeEach(function () {
      this.server = startMirage();
      this.server.logging = true;
    });

    afterEach(function () {
      this.server.shutdown();
    });

    beforeEach(async function () {
      await this.service.authenticateSession({
        id: 'ID',
        token: 'TOKEN'
      });
    });

    test('it loads user', async function(assert) {
      this.server.get('/accounts/ID', {
        data: {
          id: 'ID',
          attributes: {
            email: 'user@example.com'
          },
          type: 'accounts'
        }
      });

      await this.service.content;

      assert.ok(this.service.isAuthenticated);
      assert.ok(this.service.id);
      assert.equal(this.service.get('email'), 'user@example.com');
    });

    test('it handles error', async function(assert) {
      this.server.get('/accounts/ID', {}, 403);

      await this.service.content;

      assert.notOk(this.service.isAuthenticated);
      assert.notOk(this.service.id);
    });

  });

});
```

Now we can build out our current user service. We will be doing something a bit different than normal ember services, our current user services will actually extend [`ObjectProxy`](https://www.emberjs.com/api/ember/3.8/classes/ObjectProxy) and combine it with a [`DS.PromiseObject`](https://www.emberjs.com/api/ember-data/release/classes/DS.PromiseObject) to allow us to access our users properties without having to use a nested property like `currentUser.user.username`. Instead, we can just use `currentUser.username`.

```javascript
// project/client/src/app/services/current-user.js

import DS from 'ember-data';
import ObjectProxy from '@ember/object/proxy';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';

const CurrentUserService = ObjectProxy.extend({

  id: null,
  token: null,
  isAuthenticated: false,

  store: service(),

  router: service(),

  content: computed('id', function () {
    if (this.id) {
      let promise = this.store
        .findRecord('account', this.id)
        .catch((error) => this.invalidate(error));

        return DS.PromiseObject.create({ promise });
    }
  }),

  async invalidate() {
    this.setProperties({ id: null, token: null, isAuthenticated: false });
  },

  async authenticateSession({ id, authToken: token }) {
    this.setProperties({ id, token, isAuthenticated: true });

    try {
      this.router.transitionTo('dashboard');
    }
    catch(error) {
      // we expect our unit tests will fail, this is temporary anyways
    }
  }

});

CurrentUserService.reopenClass({
  isServiceFactory: true
});

export default CurrentUserService;
```

The last little bit is to create our `data-test-user` element. To do this we need to update our application template, but first, some house keeping. By default our application template is located at `app/templates/application.hbs`, however, because we are using the `--pod` flag, we will need to move it to `app/application/template.hbs` to avoid any conflicts in the future.

```handlebars
{% raw %}
{{!-- project/client/src/app/application/template.hbs --}}

{{#if currentUser.isAuthenticated}}
  <div data-test-user={{ currentUser.id}}>
    {{ currentUser.email }}
  </div>
{{/if}}

{{outlet}}
{% endraw %}
```

Our tests will not pass yet because we need to add our `currentUser` service to our application controller. First we need to generate it.

```shell
$ docker-compose run --rm client \
    ember g controller application \
      --pod
```

Then we just need to inject the service:

```javascript
// project/client/src/app/application/controller.js

import Controller from '@ember/controller';
import { inject as service } from '@ember/service';

export default Controller.extend({
  currentUser: service()
});
```

Your tests should now be passing. However, we have a couple issues.

First, if you try to use the application in your browser you will get a `401 (Unauthorized)` error. Second, our session is not persisted across browser sessions or reloads.

Let's address the `401` error first, this is happening because we are not sending the `auth-token` with our api calls. Let's go update our tests to prove it.

```javascript
// project/client/src/tests/unit/adapters/application-test.js

// ...

module('Unit | Adapter | application', function(hooks) {
  // ...

  hooks.beforeEach(function () {
    // ...
    this.session = this.owner.lookup('service:current-user');
  });

  // ...

  module('when authenticated', function ({ beforeEach }) {
    beforeEach(async function () {
      await this.session.authenticateSession({
        id: 'ID',
        authToken: 'AUTHTOKEN'
      });
    });

    test('sets headers', function(assert) {
      assert.deepEqual(this.adapter.headers, {
        'accept': 'application/vnd.api+json',
        'content-type': 'application/vnd.api+json',
        'authorization': 'Bearer AUTHTOKEN'
      });
    });
  });
});
```

Confirmed! Now we can go fix our adapter.

```javascript
// project/client/src/app/application/adapter.js

import DS from 'ember-data';
import AdapterFetch from 'ember-fetch/mixins/adapter-fetch';
import config from 'get-social/config/environment';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

const { host, namespace } = config.API;

export default DS.JSONAPIAdapter.extend(AdapterFetch, {
  currentUser: service(),
  host,
  namespace,
  headers: computed('currentUser.token', function () {
    let headers = {
      'accept': 'application/vnd.api+json',
      'content-type': 'application/vnd.api+json'
    };

    if (this.currentUser.token) {
      headers['authorization'] = `Bearer ${this.currentUser.token}`;
    }

    return headers;
  })
});
```

Awesome, now if we open our browser and go through our login flow we will see our email address as expected.

The last problem is our ephemeral session. To fix this, we are going to leverage [`ember-simple-auth`](https://github.com/simplabs/ember-simple-auth).

## Ember Simple Auth

> Ember Simple Auth is a lightweight library for implementing authentication/authorization with Ember.js applications. It has minimal requirements with respect to application structure, routes etc. With its pluggable strategies it can support all kinds of authentication and authorization mechanisms.

Great, let's get started by installing ember simple auth.

```shell
$ docker-compose run --rm client \
    ember install ember-simple-auth
```

We'll then need to restart our client container and test runner.

```shell
$ docker-compose restart client
$ docker-compose run  --rm  --publish "7357:7357" -e CI=true client \
    ember test --server
```

With ember simple auth installed, the first thing we will do is create an [authenticator](http://ember-simple-auth.com/api/classes/BaseAuthenticator.html) our session.

```shell
$ docker-compose run --rm client \
    ember g authenticator application
```

Unfortunatley the ember simple auth generators do not support the `--pod` flag, so, we have to manually move the file to fit the pod structure. Feel free to skip this if you could care less.

```shell
$ mv \
  client/src/app/authenticators/application.js \
  client/src/app/application/authenticator.js
```

The generator also does not create a test for our authenticator, let's add that now:

```javascript
// project/client/src/tests/unit/authenticators/application-test.js

import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';

module('Unit | Authenticator | application', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.authenticator = this.owner.lookup('authenticator:application');
  });

  module('#restore', function () {

    test('when valid', function (assert) {
      assert.expect(1);

      this.authenticator.restore({ id: '123', token: '123', secret: 'password' })
        .then((data) => {
          assert.deepEqual(data , { id: '123', token: '123' });
        });
    });

    test('when invalid', function(assert) {
      assert.rejects(this.authenticator.restore({}));
      assert.rejects(this.authenticator.restore({ id: '123' }));
      assert.rejects(this.authenticator.restore({ token: '123' }));
    });

  });

  test('#authenticate', function(assert) {
    assert.expect(1);

    this.authenticator.authenticate({ email: 'user@example.com', usenrmae: 'steve' })
      .then((data) => {
        assert.deepEqual(data , { email: 'user@example.com', usenrmae: 'steve' });
      });
  });
});
```

We want to be sure that we are only storing an `id` and `token`, nothing else. Also, ember simple auth uses Promises under the hood which is why we are using the promise syntax over async/await.

The actual authenticator implementation is pretty straight forward.

```javascript
// project/client/src/app/application/authenticator.js

import Base from 'ember-simple-auth/authenticators/base';

export default Base.extend({

  // we only want to ever store id and token in the browser
  async restore({ id, token }) {
    if (id && token) {
      return { id, token };
    }

    throw 'missing id and token';
  },

  async authenticate(session) {
    return session;
  },

  async invalidate() {
  }
});
```

Now we need to update our `current-user` service so it calls ember simple auth's [`SessionService#authenticate`](http://ember-simple-auth.com/api/classes/SessionService.html#method_authenticate)\` method.

We also need to make a few additional tweaks, here's our updated `current-user` service.

```javascript
// project/client/src/app/services/current-user.js

// ...

import { oneWay } from '@ember/object/computed';

const CurrentUserService = ObjectProxy.extend({

  id: oneWay('session.data.authenticated.id'),
  token: oneWay('session.data.authenticated.token'),
  isAuthenticated: oneWay('session.isAuthenticated'),

  // ...

  async invalidate() {
    return this.session.invalidate();
  },

  async authenticateSession({ id, authToken: token }) {
    return this.session.authenticate('authenticator:application', { id, token });
  }

});

// ...
```

Of note, we are delegating the `id`, `token`, and `isAuthenticated` attributes to ember simple auth's session data store. We've also updated our `invalidate` and `authenticateSession` methods to call ember simple auth's `invalidate` and `authenticate` methods.

However, our user is no longer being redirected to thier dashboard. To fix this, ember simple auth gives us an [`application route mixin`](http://ember-simple-auth.com/api/classes/ApplicationRouteMixin.html) with a `routeAfterAuthentication` property.

We'll start by adding the `ApplicationRouteMixin` to our application route. First, we need to generate an application route.

```shell
$ docker-compose run --rm client \
    ember g route application \
      --pod
```

We can now write our tests to make sure our application route is extending the `ApplicationRouteMixin` and has `routeAfterAuthentication` set to `/dashboard`.

```javascript
// project/client/src/tests/unit/application/route-test.js

import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import ApplicationRouteMixin from 'ember-simple-auth/mixins/application-route-mixin';

module('Unit | Route | application', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.route = this.owner.lookup('route:application');
  });

  test('routeAfterAuthentication', function(assert) {
    assert.equal(this.route.routeAfterAuthentication, 'dashboard');
  });

  test('extends ApplicationRouteMixin', function(assert) {
    assert.ok(ApplicationRouteMixin.detect(this.route));
  });
});
```

Now we can make the tests pass.

```javascript
// project/client/src/app/application/route.js

import Route from '@ember/routing/route';
import ApplicationRouteMixin from 'ember-simple-auth/mixins/application-route-mixin';

export default Route.extend(ApplicationRouteMixin, {
  routeAfterAuthentication: 'dashboard'
});
```

## Login/Logout

Currently, to login, our users need to visit `/login` directly. Let's give them a login button, while we're at it, let's give them a logout button as well.

```javascript
// project/client/src/tests/acceptance/authentication-test.js

// ...

module('Acceptance | authentication', function(hooks) {
  // ...

  module('when authenticated', function ({ beforeEach }) {
    beforeEach(async function () {
      let session = this.owner.lookup('service:current-user');

      server.get('/accounts/USERID', {
        data: {
          id: 'USERID',
          attributes: {
            email: 'user@example.com'
          },
          type: 'accounts'
        }
      });

      await session.authenticateSession({
        id: 'USERID',
        authToken: 'TOKEN'
      });
    });

    test('can logout', async function(assert) {
      await visit('/');

      assert.dom('[data-test-user="USERID"]').exists();

      await click('[data-test-logout]');

      assert.equal(currentURL(), '/');
      assert.dom('[data-test-login]').exists();
    });
  });

  // ...
});
```

```handlebars
{% raw %}
{{!- project/client/src/app/application/template.hbs --}}

{{#if currentUser.isAuthenticated}}
  {{#with currentUser as |user|}}
    <div data-test-user={{ user.id }}>
      {{ user.email }}
    </div>
  {{/with}}

  <button {{action "invalidateSession"}} data-test-logout>
    Logout
  </button>
{{else}}
  {{#link-to "login" data-test-login}}
    Login
  {{/link-to}}
{{/if}}

{{outlet}}
{% endraw %}
```

```javascript
// project/client/src/app/application/controller.js

import Controller from '@ember/controller';
import { inject as service } from '@ember/service';

export default Controller.extend({
  currentUser: service(),

  actions: {
    invalidateSession() {
      this.currentUser.invalidate();
    }
  }
});
```

## Authenticated and Unauthenticated Routes

Another user experience issue we need to address is users being able to visit `/dashboard` when they are not logged in. Inversely, a logged in user can visit the `/login` and `/auth/:token` pages.

Like `ApplicationRouteMixin`, ember simple auth gives us an [`authenticated route mixin`](http://ember-simple-auth.com/api/classes/AuthenticatedRouteMixin.html) which requires the user to be authenticated and an [`unauthenticated route mixin`](http://ember-simple-auth.com/api/classes/UnauthenticatedRouteMixin.html) which require the user to be logged out.

We will create two new routes that will act as a base `AuthenticatedRoute` and `UnauthenticatedRoute` that we can extend with our individual routes. For these base routes, we will not use the `--pod` flag.

Let's start with our `AuthenticatedRoute`

```shell
$ docker-compose run --rm client \
    ember g route authenticated \
      --skip-router true
```

```javascript
// project/client/src/tests/unit/routes/authenticated-test.js

import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import AuthenticatedRouteMixin from 'ember-simple-auth/mixins/authenticated-route-mixin';

module('Unit | Route | authenticated', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.route = this.owner.lookup('route:authenticated');
  });

  test('authenticationRoute', function(assert) {
    assert.equal(this.route.authenticationRoute, 'login');
  });

  test('extends AuthenticatedRouteMixin', function(assert) {
    assert.ok(AuthenticatedRouteMixin.detect(this.route));
  });
});
```

```javascript
// project/client/src/app/routes/authenticated.js

import Route from '@ember/routing/route';
import AuthenticatedRouteMixin from 'ember-simple-auth/mixins/authenticated-route-mixin';

export default Route.extend(AuthenticatedRouteMixin, {
  authenticationRoute: 'login'
});
```

The `UnauthenticatedRoute` will look very similar, the main difference is we have an `routeIfAlreadyAuthenticated` attribute instead of `authenticationRoute`

```shell
$ docker-compose run --rm client \
    ember g route unauthenticated \
      --skip-router true
```

```javascript
// project/client/src/tests/unit/routes/unauthenticated-test.js

import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import UnuthenticatedRouteMixin from 'ember-simple-auth/mixins/unauthenticated-route-mixin';

module('Unit | Route | unauthenticated', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.route = this.owner.lookup('route:unauthenticated');
  });

  test('routeIfAlreadyAuthenticated', function(assert) {
    assert.equal(this.route.routeIfAlreadyAuthenticated, 'dashboard');
  });

  test('extends UnuthenticatedRouteMixin', function(assert) {
    assert.ok(UnuthenticatedRouteMixin.detect(this.route));
  });
});
```

```javascript
// project/client/src/app/routes/unauthenticated.js

import Route from '@ember/routing/route';
import UnuthenticatedRouteMixin from 'ember-simple-auth/mixins/unauthenticated-route-mixin';

export default Route.extend(UnuthenticatedRouteMixin, {
  routeIfAlreadyAuthenticated: 'dashboard'
});
```

With our `Unuthenticated` and `Authenticated` routes complete, let's write some tests for our `/login` and `/dashboard` to make sure they extend one of these new routes.

Let's start with our `dashboard` route.

```javascript
// project/client/src/tests/unit/dashboard/route-test.js

import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import AuthenticatedRoute from 'get-social/routes/authenticated';

module('Unit | Route | dashboard', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.route = this.owner.lookup('route:dashboard');
  });

  test('it exists', function(assert) {
    assert.ok(this.route instanceof AuthenticatedRoute);
  });
});
```

Then we just need to update our dashboard route file.

```javascript
// project/client/src/app/dashboard/route.js

import AuthenticatedRoute from 'get-social/routes/authenticated';

export default AuthenticatedRoute.extend({
});
```

And then repeat for our login route.

```javascript
// project/client/src/tests/unit/login/route-test.js

import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import UnauthenticatedRoute from 'get-social/routes/unauthenticated';

module('Unit | Route | login', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.route = this.owner.lookup('route:login');
  });

  test('it exists', function(assert) {
    assert.ok(this.route instanceof UnauthenticatedRoute);
  });
});
```

```javascript
// project/client/src/app/login/route.js

import UnauthenticatedRoute from 'get-social/routes/unauthenticated';

export default UnauthenticatedRoute.extend({
});
```

Lastly, we need to update our `/auth/:token` route.

```javascript
// project/client/src/tests/unit/token/route-test.js

import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import UnauthenticatedRoute from 'get-social/routes/unauthenticated';

module('Unit | Route | token', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.route = this.owner.lookup('route:token');
  });

  test('it exists', function(assert) {
    assert.ok(this.route instanceof UnauthenticatedRoute);
  });
});
```

```javascript
// project/client/src/app/token/route.js

import UnauthenticatedRoute from 'get-social/routes/unauthenticated';
// ..

export default UnauthenticatedRoute.extend({
  // ..
});
```

## Handling Server Errors

The last little bit to take care of is handling server errors. Currently if we visit `/auth/:token` with an invalid token our ember application shits itself. Let's first write a test to prove it. We expect a user that visits `/auth/:token` with an invalid/expired token to be redirected to the `/login` page.

```javascript
// project/client/src/tests/acceptance/authentication-test.js

// ...

module('Acceptance | authentication', function(hooks) {
  // ...

  module('visiting /auth/:tokn', function () {
    // ...

    test('with invalid token', async function() {
      server.post('/sessions', {"errors":[{"detail":"Unauthorized","status":401,"title":"Unauthorized"}],"jsonapi":{"version":"1.0"}}, 401);
      await visit('/auth/12345');

      assert.equal(currentURL(), '/login');
    })
  });

  // ...

});
```

To handle this error, we will leverage the token route's [error event](https://emberjs.com/api/ember/3.8/classes/Route/events/error?anchor=error).

```javascript
// project/client/src/app/token/route.js

// ...

export default UnauthenticatedRoute.extend({

  // ...

  actions: {

    error() {
      this.transitionTo('login');
    }

  }

});
```

The next server error to test for is when we encounter an error requesting our magic link in the first place. We will add this test to our login component. Currently, we can provide our component with an `onsuccess` parameter, let's add an `onerror` action, This way it will be the responsibility of the page the component lives on to display any errors. There are two errors we need to test for, first is a `422` when our data fails validation on the server. The other error is anything else :P

Here's what our tests should look like.

```javascript
{% raw %}// project/client/src/tests/integration/components/login-form/component-test.js

// ...

module('Integration | Component | login-form', function(hooks) {
  // ...

  hooks.beforeEach(async function () {
    // ...
    this.error = sinon.spy();

    await render(hbs`
      <LoginForm @onsuccess={{success}} @onerror={{error}}/>
    `);
  });

  // ...

  module('handles server errors', function () {

    test('when error', async function(assert) {
      let errors = [
        {
          status: '500',
          detail: 'Internal Server Error'
        }
      ];

      this.server.post('/sessions', { errors }, 500);

      await fillIn('[data-test-input="email"]', 'user@example.com');
      await click('[data-test-submit]:enabled');

      sinon.assert.notCalled(this.success);
      sinon.assert.calledOnce(this.error);
      assert.expect(0);
    });

    test('when invalid', async function(assert) {
      let errors = [
        {
          status: '422',
          detail: 'can\'t be blank',
          source: { pointer: '/data/attributes/email'}
        }
      ];

      this.server.post('/sessions', { errors }, 422);

      await fillIn('[data-test-input="email"]', 'user@example.com');
      await click('[data-test-submit]:enabled');

      sinon.assert.notCalled(this.success);
      sinon.assert.notCalled(this.error);

      assert.dom('[data-test-hint="email"]').hasText('can\'t be blank');
    });
  });
});{% endraw %}
```

Now we can update our component logic to handle for the error when we call `save` on our session. We need to check if the error is an instance of [`DS.InvalidError`](https://emberjs.com/api/ember-data/3.2/classes/DS.AdapterError) so we can add the server errors to our changeset so our UI shows the errors.

```javascript
// project/client/src/app/components/login-form/component.js

// ...
import DS from 'ember-data';

export default Component.extend({
  // ...

  onerror() {},

  actions: {
    async authenticate(event) {
      // ...

      if (this._changeset.isValid) {
        // ...

        try {
          await session.save();

          this.onsuccess(session);
        }
        catch(error) {
          // https://emberjs.com/api/ember-data/3.2/classes/DS.AdapterError
          if (error instanceof DS.InvalidError) {
            session.errors.forEach(({ attribute, message }) => {
              this._changeset.pushErrors(attribute, message);
            });
          }
          else {
            this.onerror(error);
          }
        }
      }
    }
  }

});
```

With that, we've got a complete client side implementation of passwordless auth.