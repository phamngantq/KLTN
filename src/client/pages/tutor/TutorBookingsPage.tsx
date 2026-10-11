import { BookingsDashboard } from '../../components/domain/BookingsDashboard';

export function TutorBookingsPage() {
  return (
    <BookingsDashboard
      viewer="tutor"
      title="Yêu cầu đặt lịch"
      description="Xác nhận hoặc từ chối yêu cầu mới và quản lý các buổi dạy."
    />
  );
}
