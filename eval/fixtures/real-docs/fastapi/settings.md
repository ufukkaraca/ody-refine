# Settings and Environment Variables

In many cases your application could need some external settings or configurations, for example secret keys, database credentials, credentials for email services, etc.

Most of these settings are variable (can change), like database URLs. And many could be sensitive, like secrets.

For this reason it's common to provide them in environment variables that are read by the application.

## Types and validation

These environment variables can only handle text strings. Any conversion to a different type or any validation has to be done in code.

## Pydantic `Settings`

Pydantic provides a great utility to handle settings from environment variables with Pydantic Settings management.

### Install `pydantic-settings`

```console
$ pip install pydantic-settings
```

It also comes included when you install the `all` extras with:

```console
$ pip install "fastapi[all]"
```

### Create the `Settings` object

Import `BaseSettings` from Pydantic and create a sub-class with type annotations and default values. Pydantic will read environment variables in a case-insensitive way.

### Use the `settings`

Then you can use the `settings` object in your application.

## Settings in a dependency

Provide the settings from a dependency for easier testing.

## Reading a `.env` file

If you have many settings, put them in a `.env` file. Pydantic has support for dotenv files.

For this to work, you need to `pip install python-dotenv`.

## Creating the `Settings` only once with `lru_cache`

Reading a file from disk is normally a slow operation. Use `@lru_cache` decorator so the `Settings` object is created only once. The `@lru_cache` is part of `functools` in Python's standard library.

## Recap

You can use Pydantic Settings to handle configurations with all the power of Pydantic models.

* By using a dependency you can simplify testing.
* You can use `.env` files with it.
* Using `@lru_cache` lets you avoid reading the dotenv file for each request.
