using Google.Cloud.Firestore;
using Lucrato.Application;
using Lucrato.Infrastructure.Auth;
using Lucrato.Infrastructure.Firestore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Lucrato.Infrastructure;

public static class DependencyInjection
{
    /// <summary>Registers Firestore + Firebase auth services. Reads the "Firebase" config section.</summary>
    public static IServiceCollection AddLucratoInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<FirebaseOptions>(configuration.GetSection("Firebase"));

        services.AddSingleton<FirestoreDb>(sp =>
        {
            var opts = sp.GetRequiredService<IOptions<FirebaseOptions>>().Value;
            // Uses Application Default Credentials (Cloud Run service account / GOOGLE_APPLICATION_CREDENTIALS).
            return new FirestoreDbBuilder { ProjectId = opts.ProjectId }.Build();
        });

        services.AddSingleton<IFirebaseTokenVerifier, FirebaseTokenVerifier>();
        services.AddScoped<IDatabaseRepository, FirestoreDatabaseRepository>();

        return services;
    }
}
