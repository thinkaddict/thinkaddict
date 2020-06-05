exports.handler = async (event, context, callback) => {
  const request = event.Records[0].cf.request;

  if (request.uri !== '/status.json') {
    return request;
  }

  console.log(request);

  return {
    status: '200',
    statusDescription: 'OK',
    headers: {
      'content-type': [
        { key: 'content-type', value: 'application/json' }
      ]
    },
    body: JSON.stringify({ request }, null, 2)
  };
};