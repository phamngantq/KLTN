export interface AppVariables {
  requestId: string;
}

export interface AppEnv {
  Bindings: CloudflareBindings;
  Variables: AppVariables;
}
