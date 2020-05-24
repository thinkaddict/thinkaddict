source .cloudformation

echo "💾 Updating ${STACKNAME}..."
echo ""

aws cloudformation update-stack \
  --template-body file://aws/cloudformation.yml \
  --stack-name ${STACKNAME} \
  --region us-east-1 \
  --capabilities CAPABILITY_IAM \
  --parameters \
    ParameterKey=GitHubRepo,UsePreviousValue=true \
    ParameterKey=GitHubBranch,UsePreviousValue=true \
    ParameterKey=GitHubUser,UsePreviousValue=true \
    ParameterKey=GitHubToken,UsePreviousValue=true