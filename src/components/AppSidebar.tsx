import { Home, Utensils, Weight, Droplets, Calendar, Sparkles, Trophy } from "lucide-react";
import { NavLink } from "react-router-dom";
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
import wizardLogo from "@/assets/wizard-logo.png";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import { useIsMobile } from "@/hooks/use-mobile";

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
        <div className="p-4 border-t">
          <ProfileDropdown />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}