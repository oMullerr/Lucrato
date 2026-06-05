# Multi-stage build for the Lucrato .NET 10 API, targeting Google Cloud Run.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore (cached) using only project files first.
COPY Lucrato.sln ./
COPY src/Lucrato.Domain/Lucrato.Domain.csproj src/Lucrato.Domain/
COPY src/Lucrato.Application/Lucrato.Application.csproj src/Lucrato.Application/
COPY src/Lucrato.Infrastructure/Lucrato.Infrastructure.csproj src/Lucrato.Infrastructure/
COPY src/Lucrato.Api/Lucrato.Api.csproj src/Lucrato.Api/
COPY tests/Lucrato.Tests/Lucrato.Tests.csproj tests/Lucrato.Tests/
RUN dotnet restore src/Lucrato.Api/Lucrato.Api.csproj

# Build + publish the API.
COPY . ./
RUN dotnet publish src/Lucrato.Api/Lucrato.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./

# Cloud Run sets $PORT (default 8080); Program.cs binds to it.
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["dotnet", "Lucrato.Api.dll"]
