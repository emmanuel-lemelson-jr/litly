export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = new URL("https://litly.com");
    target.pathname = url.pathname;
    target.search = url.search;
    return Response.redirect(target.toString(), 301);
  },
};
