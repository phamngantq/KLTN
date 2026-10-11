/** Shared API envelope types used by both the Worker and the browser client. */
export interface ApiMeta {
  requestId: string;
}

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: ApiMeta;
}

export interface HealthStatus {
  status: 'ok';
}
