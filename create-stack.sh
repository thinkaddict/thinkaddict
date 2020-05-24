echo "🚀 Creating ${1}..."
echo "🔗 Source: github.com/${2}/${3}#${4}"
echo ""

echo "STACKNAME=${1}" > .cloudformation

aws cloudformation create-stack \
  --template-body file://aws/cloudformation.yml \
  --stack-name ${1} \
  --region us-east-1 \
  --capabilities CAPABILITY_IAM \
  --parameters \
    ParameterKey=GitHubUser,ParameterValue=\"${2}\" \
    ParameterKey=GitHubRepo,ParameterValue=\"${3}\" \
    ParameterKey=GitHubBranch,ParameterValue=\"${4}\" \
    ParameterKey=GitHubToken,ParameterValue=\"${5}\"  

