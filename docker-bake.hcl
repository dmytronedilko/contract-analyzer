# Builds the api and web images: `docker buildx bake` (both) or `docker buildx bake api`.
# CI overrides the tags (local/api:ci, local/web:ci) and sets the GitHub Actions cache per target.

variable "GIT_SHA" {
  default = "unknown"
}

variable "NEXT_PUBLIC_MAX_UPLOAD_MB" {
  default = "25"
}

group "default" {
  targets = ["api", "web"]
}

target "api" {
  tags       = ["local/api:dev"]
  context    = "."
  dockerfile = "apps/api/Dockerfile"
  args = {
    GIT_SHA = GIT_SHA
  }
}

target "web" {
  tags       = ["local/web:dev"]
  context    = "."
  dockerfile = "apps/web/Dockerfile"
  args = {
    NEXT_PUBLIC_MAX_UPLOAD_MB = NEXT_PUBLIC_MAX_UPLOAD_MB
  }
}
