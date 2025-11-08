import { Home, Utensils, Weight, Droplets, Calendar, Sparkles, Trophy, RotateCcw } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import wizardLogo from "@/assets/wizard-logo.png";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import { useIsMobile } from "@/hooks/use-mobile";
import { DataResetDialog } from "@/components/DataResetDialog";

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Fight Camps", url: "/fight-camps", icon: Trophy },
  { title: "Nutrition", url: "/nutrition", icon: Utensils },
  { title: "Weight Tracker", url: "/weight", icon: Weight },
  { title: "Rehydration", url: "/hydration", icon: Droplets },
  { title: "Fight Week", url: "/fight-week", icon: Calendar },
  { title: "AI Wizard", url: "/wizard", icon: Sparkles },
];

export function AppSidebar() {
  const { setOpenMobile } = useSidebar();
  const isMobile = useIsMobile();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="p-4">
          <div className="flex items-center gap-3">
            <img src={wizardLogo} alt="Wizard" className="w-12 h-12" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Weight Cut Wizard
            </h1>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url}
                      onClick={handleNavClick}
                      className={({ isActive }) => 
                        isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="p-4 border-t space-y-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setResetDialogOpen(true)}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset All Data
          </Button>
          <ProfileDropdown />
        </div>
      </SidebarFooter>
      <DataResetDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen} />
    </Sidebar>
  );
}