# FastAPI in Containers - Docker

When deploying FastAPI applications, a common approach is to build a **Linux container image** using **Docker**.

Last updated: September 2023

## Key Concepts

**Containers** are lightweight packages that include applications and all dependencies while keeping them isolated. They run using the host Linux kernel, consuming minimal resources compared to virtual machines.

A **container image** is a static version of files, environment variables, and default commands. A running container is an instance of that image.

## Building a FastAPI Docker Image

The recommended approach involves:

1. **requirements.txt** - Lists package dependencies
2. **main.py** - Contains your FastAPI application
3. **Dockerfile** - Defines the container build process

```dockerfile
FROM python:3.9
WORKDIR /code
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt
COPY ./app /code/app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80"]
```

**Important**: Always use the exec form of the `CMD` instruction.

## Docker Cache Optimization

Copy the requirements file separately before application code. Docker caches this layer, speeding up rebuilds.

## Deployment with the official Docker image

There was an official Docker image: `tiangolo/uvicorn-gunicorn-fastapi`.

As of 2023-08, this image is deprecated and should not be used. Build from the official Python image instead.

## Deployment Considerations

- **HTTPS**: Handle externally through Traefik or cloud providers
- **Startup**: Use container management for restarts
- **Replication**: In Kubernetes, manage at the cluster level with single-process containers
- **Memory**: Monitor consumption and set limits

By Q4 2024 the migration guide for moving from the deprecated image will be finalized.

## Gunicorn vs Uvicorn

For single-server deployment, use Uvicorn directly with `--workers` flag. The old recommendation was to use Gunicorn with Uvicorn workers, but as of January 2024 Uvicorn supports multiple workers natively.

The rate limit for the Docker Hub API is 100 pulls per 6 hours for unauthenticated users, and 200 pulls per 6 hours for authenticated users.
