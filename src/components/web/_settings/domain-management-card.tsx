"use client";

import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { toast } from "sonner";
import { Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddDomainDialog } from "./add-domain-dialog";

interface DomainItem {
  id: string | null;
  domain: string;
  isDefault: boolean;
  isSystem: boolean;
}

interface DomainsResponse {
  defaultDomain: string;
  domains: DomainItem[];
}

const fetcher = async (url: string): Promise<DomainsResponse> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch domains");
  return response.json();
};

export function DomainManagementCard({
  workspaceslug,
}: {
  workspaceslug: string;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const { data, mutate } = useSWR<DomainsResponse>(
    `/api/workspace/${workspaceslug}/domains`,
    fetcher,
  );

  const domains = data?.domains ?? [];

  const handleDomainAdded = (domain: DomainItem) => {
    void mutate(
      (prev) =>
        prev
          ? { ...prev, domains: [...prev.domains, domain] }
          : { defaultDomain: domain.domain, domains: [domain] },
      false,
    );
    setAddOpen(false);
  };

  const handleSetDefault = async (item: DomainItem) => {
    try {
      await axios.patch(`/api/workspace/${workspaceslug}/domains`, {
        domainId: item.id,
      });
      await mutate();
      toast.success(`Default domain set to ${item.domain}`);
    } catch {
      toast.error("Failed to update default domain");
    }
  };

  const handleDelete = async (item: DomainItem) => {
    if (
      !confirm(
        `Delete domain "${item.domain}"? Links using it will still exist in the database.`,
      )
    )
      return;
    try {
      await axios.delete(`/api/workspace/${workspaceslug}/domains`, {
        data: { domainId: item.id },
      });
      await mutate();
      toast.success("Domain removed");
    } catch {
      toast.error("Failed to remove domain");
    }
  };

  return (
    <>
      <div className="space-y-4 rounded-xl border p-5 shadow-none">
        <div className="space-y-3">
          <p className="text-sm leading-none font-medium">Short Link Domains</p>
          <div className="space-y-2">
            {domains.map((item) => (
              <div
                key={item.domain}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{item.domain}</span>
                  {item.isSystem && (
                    <Badge variant="secondary" className="text-xs">
                      System
                    </Badge>
                  )}
                  {item.isDefault && (
                    <Badge className="text-xs">
                      <Star className="mr-1 h-3 w-3" />
                      Default
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!item.isDefault && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => void handleSetDefault(item)}
                    >
                      Set Default
                    </Button>
                  )}
                  {!item.isSystem && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive h-7"
                      onClick={() => void handleDelete(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {domains.length === 0 && (
              <p className="text-muted-foreground py-1 text-sm">
                No custom domains added yet.
              </p>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            Domains used for creating short links in this workspace.
          </p>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Domain
          </Button>
        </div>
      </div>

      <AddDomainDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        workspaceslug={workspaceslug}
        onDomainAdded={handleDomainAdded}
      />
    </>
  );
}
