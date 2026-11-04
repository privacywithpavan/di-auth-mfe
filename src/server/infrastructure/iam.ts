import "server-only";
import { config } from "@/server/config";
import { IamClient } from "@/server/infrastructure/iam-client";

const globalIam = globalThis as unknown as { iamClient?: IamClient };

function getIamClient() {
  return (
    globalIam.iamClient ??
    new IamClient({
      baseUrl: config.iamUrl,
      configurationUrl: config.configurationUrl,
      subscriberId: config.subscriberId,
      subscriberSecret: config.subscriberSecret,
    })
  );
}

// Resolve runtime configuration on the first request, not during next build.
export const iamClient = new Proxy({} as IamClient, {
  get(_target, property) {
    globalIam.iamClient ??= getIamClient();
    const value = Reflect.get(globalIam.iamClient, property);
    return typeof value === "function"
      ? value.bind(globalIam.iamClient)
      : value;
  },
});
