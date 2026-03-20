# First Steps

The simplest FastAPI file could look like this:

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}
```

Copy that to a file `main.py`.

Run the live server:

```console
$ fastapi dev
```

In the output, there's a line with something like:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

That line shows the URL where your app is being served on your local machine.

## Interactive API docs

Now go to http://127.0.0.1:8000/docs.

You will see the automatic interactive API documentation (provided by Swagger UI).

## Alternative API docs

Go to http://127.0.0.1:8000/redoc for the alternative automatic documentation (provided by ReDoc).

## OpenAPI

**FastAPI** generates a "schema" with all your API using the **OpenAPI** standard for defining APIs.

A "schema" is a definition or description of something. Not the code that implements it, but just an abstract description.

OpenAPI defines an API schema for your API. And that schema includes definitions of the data sent and received by your API using **JSON Schema**.

## Recap, step by step

### Step 1: import `FastAPI`

`FastAPI` is a Python class that provides all the functionality for your API.

`FastAPI` is a class that inherits directly from `Starlette`. You can use all the Starlette functionality with `FastAPI` too.

### Step 2: create a `FastAPI` "instance"

The `app` variable will be an "instance" of the class `FastAPI`.

### Step 3: create a path operation

"Path" here refers to the last part of the URL starting from the first `/`.

"Operation" here refers to one of the HTTP "methods": POST, GET, PUT, DELETE, OPTIONS, HEAD, PATCH, TRACE.

When building APIs, you normally use: POST to create data, GET to read data, PUT to update data, DELETE to delete data.

The `@app.get("/")` tells FastAPI that the function right below is in charge of handling requests that go to the path `/` using a `get` operation.

### Step 4: define the path operation function

This is a Python function that will be called by FastAPI whenever it receives a request to the URL "/" using a GET operation.

### Step 5: return the content

You can return a `dict`, `list`, singular values as `str`, `int`, etc. You can also return Pydantic models.
