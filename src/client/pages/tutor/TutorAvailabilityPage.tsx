import { ExceptionsPanel } from '../../components/domain/ExceptionsPanel';
import { WeeklyScheduleEditor } from '../../components/domain/WeeklyScheduleEditor';
import { Button } from '../../components/ui/Button';
import { Alert, PageHeader } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useWeeklyAvailability } from '../../features/availability/api';

export function TutorAvailabilityPage() {
  const weekly = useWeeklyAvailability();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Lịch dạy"
        description="Học viên chỉ đặt được các khung giờ nằm trong lịch này. Buổi đã đặt không bị thay đổi khi bạn sửa lịch."
      />
      {weekly.isPending ? (
        <PageLoading />
      ) : weekly.isError ? (
        <Alert
          tone="danger"
          title="Không tải được lịch tuần"
          action={
            <Button variant="secondary" onClick={() => void weekly.refetch()}>
              Thử lại
            </Button>
          }
        >
          {weekly.error.message}
        </Alert>
      ) : (
        <WeeklyScheduleEditor weekly={weekly.data} />
      )}
      <ExceptionsPanel />
    </div>
  );
}
