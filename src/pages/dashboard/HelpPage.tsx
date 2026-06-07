import { DashboardLayout } from "@/components/DashboardLayout";
import { BookOpen, MessageCircle, HelpCircle, ExternalLink } from "lucide-react";

const HelpPage = () => (
  <DashboardLayout>
    <div className="space-y-5 max-w-[1200px]">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Help & Support</h1>
        <p className="text-[13px] text-muted-foreground">Get help with using Illuxus</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { icon: BookOpen, title: "Documentation", desc: "Browse guides and tutorials" },
          { icon: MessageCircle, title: "Contact Support", desc: "Reach out for personalized assistance" },
          { icon: HelpCircle, title: "FAQ", desc: "Find answers to common questions" },
        ].map((item) => (
          <div key={item.title} className="bg-card border border-border rounded-lg p-5 hover:border-foreground/10 transition-colors cursor-pointer">
            <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center mb-3">
              <item.icon className="h-4 w-4 text-foreground" />
            </div>
            <h3 className="text-sm font-semibold mb-1 flex items-center gap-1">
              {item.title} <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </h3>
            <p className="text-[13px] text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </DashboardLayout>
);

export default HelpPage;