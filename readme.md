# ThinkAddict

The source for [thinkaddict.com](https://thinkaddict.com).

Static site built with [Jekyll](https://jekyllrb.com/) and [TailwindCSS](https://tailwindcss.com/) deployed to AWS via [Cloudformation](https://aws.amazon.com/cloudformation/), [CodePipeline](https://aws.amazon.com/codepipeline/), [S3](https://aws.amazon.com/s3/) and [Cloudfront](https://aws.amazon.com/cloudfront/).

We also 💜 [CloudCannon.com](https://cloudcannon.com/) as the CMS for Jekyll.

## Development

Ensure you have [Docker](https://www.docker.com/products/docker-desktop) installed on your local machine and then run:

```
$ docker-compose up
```

## AWS

### Creating the Stack

```shell
$ ./create-stack.sh STACKNAME GITHUBUSER GITHUBREPO GITHUBBRANCH GITHUBTOKEN ALIASES_CSV
```

NOTE: This will create or update the `STACKNAME` in the `.cloudformation.{GITHUBBRANCH}` file.

### Updating the Stack

```shell
$ ./update-stack.sh GITHUBBRANCH:master
```
