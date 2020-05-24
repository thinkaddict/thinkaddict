---
title:
headline:
cover_image: >-
  https://images.unsplash.com/photo-1513061780970-4f34b3f350dd?ixlib=rb-0.3.5&ixid=eyJhcHBfaWQiOjEyMDd9&s=ca42c094b7add80e92c1f737d6853458&auto=format&fit=crop&w=500&h=280&q=80
date: 2018-11-17 00:00:00 -0800
tags:
  - emberjs
  - elixir
  - jsonapi
  - AWS S3
prerequisite_posts:
published: false
---

```shell
$ ember install ember-file-upload
```




# TODO:
- add cloudformation to setup s3 bucket w permissions and cors
- add drop zone to application layout so files can be dropped anywhere
- show upload queue in nav bar or overlay
- add phoenix endpoints for signature, list, show, and deleting assets
- user can click and show all their assets plus view and delete assets
- follow up should be SQS where we can purge expired assets and update the asset status in the databse

# Ember drag and drop

Maybe not needed?
- https://github.com/mharris717/ember-drag-drop
- https://dockyard.com/blog/2018/07/20/drag-and-drop-on-ios-with-ember

Since this provides its own dropzone
- https://github.com/adopted-ember-addons/ember-file-upload

# S3 direct upload

* https://www.dailydrip.com/topics/elixirsips/drips/direct-uploads-with-s3-in-a-phoenix-api
* https://medium.com/founders-coders/image-uploads-with-aws-s3-elixir-phoenix-ex-aws-step-1-f6ed1c918f14
* https://haughtcodeworks.com/blog/software-development/s3-direct-uploads-with-ember-and-phoenix/
* https://dockyard.com/blog/2017/08/22/building-an-image-upload-api-with-phoenix
- https://dockyard.com/blog/2018/07/20/drag-and-drop-on-ios-with-ember

## Send Meta Data

* https://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectPOST.html
* https://docs.aws.amazon.com/AmazonS3/latest/dev/UsingMetadata.html#object-metadata

## API

We want to be able to `POST /assets/` with our file details like `name`, `size` and `content_type`. We will not be uploading the file to our phoenix server, just its meta data. We should get back an asset with instructions for uploading the file directly to S3.

### REQUEST

```json
{
  "data": {
    "attributes": {
      "name": "23498516_189755468252172_3812657788807544832_n.jpg",
      "content-type": "image/jpeg",
      "size": 55035
    },
    "type": "asset"
  }
}
```

### RESPONSE

```json
{
  "data": {
    "type": "asset",
    "id": "57d471f2-1a8a-4058-a648-d17b9d785361",
    "attributes": {
      "state": "pending",
      "signature": ["/s3-upload/dd7aba8b-9e9e-458f-b6f5-2afa8a634aa9",
        {
          "data": {
            "key": "cache/dd7aba8b-9e9e-458f-b6f5-2afa8a634aa9.jpg"
          }
        }
      ]
    }
  }
}
```

Our assets will need different `states` so we can track progress:

* `pending` - the `Asset` is created and S3 upload instructions have been generated and sent to the browser
* `cached` - the file has been uploaded to S3. Cached files will leverage [S3 Object Lifecycle Management](https://docs.aws.amazon.com/AmazonS3/latest/dev/object-lifecycle-mgmt.html) to set an expiraton. Once they expire, files will be deleted so we dont pay for S3 storage for unused files.
* `purged` - the `cached` files has been purged from S3
* `stored` - the `Asset` has been moved to permanent storeage, this will happen when the `Asset` is attached and used.

**Asset**

```shell
$ mix phx.gen.json Attachments Asset assets \
  state:string \
  name:string \
  content_type:string \
  size:integer \
  cached_at:naive_datetime \
  stored_at:naive_datetime \
  store:map
```

```shell
$ mix ecto.migrate
```

We'll use the `signature` attribute and pass it directly to the javascript client. Since I'm a fan of ember, let's use the [`ember-file-upload`](https://github.com/adopted-ember-addons/ember-file-upload/) component. By passing the value directly ti the `File#upload` function, we can manage upload configuration from the server and not need to worry about the client implementation. Depending on which client you are using, you may need to tweak the `signature` structure.

You can see what the `File#upload` function expects here: https://github.com/adopted-ember-addons/ember-file-upload/blob/2.5.1/addon/file.js#L284-L292

Let's generate our ember model so we can leverage `ember-data` for our JSONAPI.

```shell
$ ember g model asset name:string content-type:string size:number signature
```

Let's create an ember component to handle our uploads.

```shell
$ ember g component asset-upload --pod
```

NOTE: The `--pod` flag puts the javascript and templates in the `components/asset-upload` folder making them easier to manage.

```javascript
// app/components/asset-upload/component.js
import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default Component.extend({
  store: service(),

  success (/* asset, file */) {},

  error (/* error, file */) {},

  actions: {
    async upload(file) {
      try {
        let { name, size, type: contentType } = file;
        let asset = this.store.createRecord('asset', { name, size, contentType });
        let { signature } = await asset.save();

        // pass the `signature` value directly on to `File#upload`
        await file.upload(...signature);
        
        // do we want/need to wait for the asset to upload?
        // file.upload(...signature);

        this.success(asset, file);
      }
      catch(error) {
        file.set('state', 'failed');

        this.error(error, file);
      }
    }
  }
});
```

Finally we'll add the `ember-file-upload` component to our template using angle brackets available in ember 3.4.

```handlebars
{% raw %}
{{!-- app/components/asset-upload/template.hbs --}}
<FileUpload
  @name="photos"
  @accept="image/*"
  @onfileadd={{action "upload"}} as |queue|
>

  <a class="button">
    {{#if queue.files.length}}
      Uploading...
    {{else}}
      Upload file
    {{/if}}
  </a>

</FileUpload>
{% endraw %}
```

**NOTE: This should have a conslusive end. i.e. show the image on the page. Then we can explain expiring and "attachment" strategies.**

Once the browser has finished uploading the file to S3, we will rely on [S3 Event Notifications](https://docs.aws.amazon.com/AmazonS3/latest/dev/NotificationHowTo.html) to update our `Asset#status`. Check out the [SQS Tutorial](sqs.md) to see how to poll SQS for events.

Once the `asset` has been `cached`, we will need to move it to permanent storage. However, We only want to do that if its being used. I've found to idea of "attaching" it to something a nice abstraction. This allows us to reuse the same asset for say an avatar and a social media post.

This also allows us to treat the asset differently depending on what the attachment is. For instance, an avatar will have smaller sizes and might not be watermarked compared to a social media post attachment.

In rails we might do something like:

```ruby
def Attachment::Profile < Attachment
  enum key: %i[avatar]
end

def Profile
  has_one :avatar, -> { Attachment::Profile.cover },
                    class_name: 'Attachment::Profile',
                    as: :assetable,
                    dependent: :destroy
end
```

This leverages polymorphic associations and a special enum to determine what property of the profile the attachment represents. This also allows us to have many attachments for an objects like a social media post. For instagram now allows users to create posts with multiple media items.

* https://stackoverflow.com/a/33297178
* https://github.com/elixir-ecto/ecto/issues/659
* https://blog.drewolson.org/composable-queries-ecto
* https://github.com/elixir-ecto/ecto/issues/749
* https://medium.com/@McElaney/so-let's-say-we-have-a-system-that-tracks-vehicles-d2c05309328d
* https://github.com/DockYard/inquisitor
* https://blog.echobind.com/composable-queries-with-ecto-part-2-e590af56d741
* https://blog.echobind.com/composable-ecto-queries-in-action-c57ae2ea665

### BONUS: Get S3 Object Detail

```elixir
ExAws.S3.get_object(bucket, key) \
|> ExAws.request([
  region: "",
  access_key_id: "",
  secret_access_key: ""
]) \
|> IO.inspect
```