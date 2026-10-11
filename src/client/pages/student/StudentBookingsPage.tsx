import { BookingsDashboard } from '../../components/domain/BookingsDashboard';

export function StudentBookingsPage() {
  return (
    <BookingsDashboard
      viewer="student"
      title="Lịch học của tôi"
      description="Theo dõi yêu cầu đặt lịch và các buổi học với gia sư."
    />
  );
}
