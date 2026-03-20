# Express Routing

_Routing_ refers to how an application's endpoints (URIs) respond to client requests.

You define routing using methods of the Express `app` object that correspond to HTTP methods; for example, `app.get()` to handle GET requests and `app.post()` to handle POST requests. You can also use `app.all()` to handle all HTTP methods and `app.use()` to specify middleware.

These routing methods specify a callback function called when the application receives a request to the specified route and HTTP method.

## Route methods

A route method is derived from one of the HTTP methods, and is attached to an instance of the `express` class.

```js
// GET method route
app.get('/', (req, res) => {
  res.send('GET request to the homepage')
})

// POST method route
app.post('/', (req, res) => {
  res.send('POST request to the homepage')
})
```

Express supports methods that correspond to all HTTP request methods: `get`, `post`, and so on.

There is a special routing method, `app.all()`, used to load middleware functions at a path for all HTTP request methods.

## Route paths

Route paths, in combination with a request method, define the endpoints at which requests can be made. Route paths can be strings, string patterns, or regular expressions.

In Express 5, the characters `?`, `+`, `*`, `[]`, and `()` are handled differently than in version 4.

Express uses path-to-regexp for matching the route paths.

## Route parameters

Route parameters are named URL segments that capture values at their position in the URL. The captured values are populated in the `req.params` object.

```
Route path: /users/:userId/books/:bookId
Request URL: http://localhost:3000/users/34/books/8989
req.params: { "userId": "34", "bookId": "8989" }
```

The name of route parameters must be made up of "word characters" ([A-Za-z0-9_]).

## Route handlers

You can provide multiple callback functions that behave like middleware to handle a request. These callbacks might invoke `next('route')` to bypass the remaining route callbacks.

## Response methods

The methods on the response object (`res`) can send a response to the client: `res.download()`, `res.end()`, `res.json()`, `res.jsonp()`, `res.redirect()`, `res.render()`, `res.send()`, `res.sendFile()`, `res.sendStatus()`.

## app.route()

You can create chainable route handlers for a route path by using `app.route()`.

## express.Router

Use the `express.Router` class to create modular, mountable route handlers. A `Router` instance is a complete middleware and routing system, often referred to as a "mini-app".
