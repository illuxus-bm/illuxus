import { DashboardLayout } from "@/components/DashboardLayout";
import { FileText } from "lucide-react";

const ReportsPage = () => (
  <DashboardLayout>
    <div className="space-y-5 max-w-[1200px]">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Reports</h1>
        <p className="text-[13px] text-muted-foreground">Generate and download reports</p>
      </div>
      <div className="text-center py-16 border border-dashed border-border rounded-lg">
        <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm font-medium mb-1">Reports Coming Soon</p>
        <p className="text-[13px] text-muted-foreground max-w-md mx-auto">
          Export event data, attendee lists, and financial summaries.
        </p>
      </div>
    </div>
  </DashboardLayout>
);

export default ReportsPage;