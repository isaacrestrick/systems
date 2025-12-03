"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { demos } from "@/lib/demos";
import { Home, ChevronLeft, ChevronRight } from "lucide-react";

const navItems = [{ href: "/", title: "Home", icon: Home }, ...demos];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r bg-background transition-all duration-200",
        collapsed ? "w-14" : "w-56"
      )}
    >
      <div className={cn("flex items-center border-b", collapsed ? "justify-center p-2" : "justify-between p-4")}>
        {!collapsed && <h1 className="text-lg font-bold">System Design</h1>}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.title : undefined}
              className={cn(
                buttonVariants({ variant: isActive ? "secondary" : "ghost" }),
                collapsed ? "justify-center px-2" : "justify-start gap-2"
              )}
            >
              {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
