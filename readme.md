# ThinkAddict

## AWS

### Creating the Stack

```shell
$ aws cloudformation create-stack \
  --template-body file://aws/cloudformation.yml \
  --stack-name thinkaddict-prod \
  --region us-east-1 \
  --capabilities CAPABILITY_IAM \
  --parameters \
    ParameterKey=GitHubRepo,ParameterValue=\"thinkaddict\" \
    ParameterKey=GitHubBranch,ParameterValue=\"master\" \
    ParameterKey=GitHubUser,ParameterValue=\"thinkaddict\" \
    ParameterKey=GitHubToken,ParameterValue=\"\"  
```
