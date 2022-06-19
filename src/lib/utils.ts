export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function createResponse(
  data: any,
  options?: { status: number },
): Response {
  return new Response(JSON.stringify(data, null, '  '), {
    headers: {
      ...corsHeaders,
      'content-type': 'application/json;charset=UTF-8',
    },
    status: options?.status,
  });
}

export function time2text(numSeconds: number): string {
  if (numSeconds < 120) {
    return `${numSeconds} seconds`;
  } else if (numSeconds < 7200) {
    return `${Math.floor(numSeconds / 60)} minutes and ${
      numSeconds % 60
    } seconds`;
  } else if (numSeconds < 24 * 3600) {
    return `${Math.floor(numSeconds / 60 / 60)} hours and ${Math.floor(
      (numSeconds % 3600) / 60,
    )} minutes`;
  } else {
    return `${Math.floor(numSeconds / 60 / 60 / 24)} days and ${Math.floor(
      (numSeconds % (60 * 60 * 24)) / 3600,
    )} hours`;
  }
}
