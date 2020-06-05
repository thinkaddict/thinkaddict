ENVIRONMENT=$(echo "${1:-master}" | sed 's/\(.\)\([A-Z]\)/\1-\2/g' | tr '[:upper:]' '[:lower:]')

source ".cloudformation.${ENVIRONMENT}"

echo "💾 Updating ${STACKNAME}..."
echo "🚦 Environment: ${ENVIRONMENT}"
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
    ParameterKey=GitHubToken,UsePreviousValue=true \
    ParameterKey=Aliases,UsePreviousValue=true
