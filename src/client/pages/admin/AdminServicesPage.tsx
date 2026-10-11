import { AdminContentPage } from './AdminContentPage';

export function AdminServicesPage() {
  return (
    <div className="[&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:text-primary [&_h2]:text-primary [&_li>button]:rounded-xl [&_li>button]:bg-bg [&_li>button]:p-5 [&_li>button]:shadow-card">
      <AdminContentPage kind="service" title="Quản lý gói dịch vụ" />
    </div>
  );
}
