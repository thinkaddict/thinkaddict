exports.handler = async (event, context, callback) => {
  const request = event.Records[0].cf.request;

  if (request.uri !== '/status.txt') {
    return request;
  }

  return {
      status: '200',
      statusDescription: 'OK',
      body: "Lambda@Edge is awesome!",
  };
};