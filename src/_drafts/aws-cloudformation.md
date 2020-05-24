---
title: AWS Cloudformation
headline: AWS Cloudformation
cover_image:
date: 2018-12-18 00:00:00 -0800
tags:
prerequisite_posts:
published: false
---

## Overview

In addition to docker, I've also added [Cloudformation](){: .cc-active} to my utility belt. Up until this point I would manually create the AWS resources like S3, Cloudfront or SQS. I wasn't too concerned with access in development so everything would be access with the same credentials with administrator priveledges. Then when it comes to deploy, I have to dig through all the code to remem,ber what services I'm using and make sure they were using the proper privledges. This was a mess and a maintanence nightmare. Honestly, AWS is so vast,  it's intimidating to figure out how to get everything setup. Plus, most of the documentation reads like stereo instructions in a foreign language.

I recently got the opportunity to dust off a side project that was setup this way. After digging through S3 buckets, their configs, SQS configs, and various other resources across aws regions, I had that sinking feeling that there was a better way. There is, it's called Cloudformation. The beautiy about is, you define your entire stack, users, and permissions in a YAML (or json) file. From that file you can easily create, update and destroy your entire stack. Plus, it serves as documentation.

I prefer YAML because you can add your own comments and notes, plus you can leverage [YAML anchors](https://blog.daemonl.com/2016/02/yaml.html):

```yml
base: &base
    name: Everyone has same name

foo: &foo
    <<: *base
    age: 10

bar: &bar
    <<: *base
    age: 20
```

## Server Stack

For our server, we will need the following:

* S3 Bucket for uploads
* SQS for background jobs
* User with S3 write access for uploads
* User with S3 read/write/delete access for processing uploads
* User with read access for IMGIX

## Client Stack

* S3
* Cloudfront