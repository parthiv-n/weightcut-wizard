import { useState, useEffect } from "react";
import { User, LogOut, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { ProfilePictureUpload } from "./ProfilePictureUpload";

export function ProfileDropdown() {
  const [user, setUser] = useState<any>(null);
  const [userName, setUserName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [editedName, setEditedName] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      const emailName = user.email?.split("@")[0] || "User";
      const formattedName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
      setUserName(formattedName);
      setEditedName(formattedName);

      // Load avatar from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .single();
      
      if (profile?.avatar_url) {
        setAvatarUrl(profile.avatar_url);
      }
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleUpdateProfile = async () => {
    try {
      // In a real app, you'd update the user's metadata or profile table
      // For now, we'll just update the local state
      setUserName(editedName);
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully",
      });
      setIsProfileOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
    }
  };

  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 outline-none">
          <Avatar className="h-8 w-8">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
            <AvatarFallback className="bg-primary text-primary-foreground">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium hidden md:inline">{userName}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-56" sideOffset={8}>
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Profile Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profile Settings</DialogTitle>
            <DialogDescription>
              View and manage your account details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Profile Picture</Label>
              <ProfilePictureUpload
                currentAvatarUrl={avatarUrl}
                onUploadSuccess={(url) => setAvatarUrl(url)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={user?.email || ""}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Created</Label>
              <Input
                value={user?.created_at ? new Date(user.created_at).toLocaleDateString() : ""}
                disabled
                className="bg-muted"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsProfileOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateProfile}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
