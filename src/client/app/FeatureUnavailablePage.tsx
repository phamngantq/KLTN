import { ButtonLink } from '../components/ui/Button';
import { Alert, PageHeader } from '../components/ui/Feedback';

/** A route can be navigated without inventing data or accepting a fake mutation. */
export function FeatureUnavailablePage({
  title,
  message,
  availableTo,
  availableLabel,
}: {
  title: string;
  message: string;
  availableTo?: string;
  availableLabel?: string;
}) {
  return (
    <section className="max-w-3xl">
      <PageHeader title={title} />
      <Alert tone="info" title="Chưa khả dụng">
        {message}
      </Alert>
      {availableTo && availableLabel && (
        <div className="mt-6">
          <ButtonLink to={availableTo} variant="secondary">
            {availableLabel}
          </ButtonLink>
        </div>
      )}
    </section>
  );
}
