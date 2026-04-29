import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Plus, X, Loader2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type TaxonomyType = "genre" | "mood" | "attribute";

const SECTIONS: { type: TaxonomyType; label: string; color: string; pillColor: string }[] = [
  { type: "genre", label: "Genre", color: "text-blue-600", pillColor: "bg-blue-100 text-blue-700 border-blue-200" },
  { type: "mood", label: "Mood", color: "text-purple-600", pillColor: "bg-purple-100 text-purple-700 border-purple-200" },
  { type: "attribute", label: "Attributes", color: "text-amber-600", pillColor: "bg-amber-100 text-amber-700 border-amber-200" },
];

function TaxonomySection({
  type, label, color, pillColor, tags, onAdd, onRemove, isAdding, isRemoving,
}: {
  type: TaxonomyType; label: string; color: string; pillColor: string;
  tags: string[];
  onAdd: (type: TaxonomyType, value: string) => void;
  onRemove: (type: TaxonomyType, value: string) => void;
  isAdding: boolean; isRemoving: string | null;
}) {
  const [input, setInput] = useState("");

  function handleAdd() {
    const val = input.trim();
    if (!val) return;
    onAdd(type, val);
    setInput("");
  }

  return (
    <div className="p-6 rounded-xl border border-border/60 bg-card">
      <div className="flex items-center gap-2 mb-4">
        <Tag className={`h-4 w-4 ${color}`} />
        <h2 className={`font-semibold text-base ${color}`}>{label}</h2>
        <span className="text-xs text-muted-foreground ml-auto">{tags.length} tag{tags.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Add new tag */}
      <div className="flex gap-2 mb-4">
        <Input
          placeholder={`Add new ${label.toLowerCase()} tag…`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          className="h-8 text-sm"
        />
        <Button
          type="button" size="sm" className="h-8 gap-1.5"
          onClick={handleAdd}
          disabled={isAdding || !input.trim()}
        >
          {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </Button>
      </div>

      {/* Tag pills */}
      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No tags yet. Add one above.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <span
              key={tag}
              className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium ${pillColor}`}
            >
              {tag}
              <button
                type="button"
                className="opacity-60 hover:opacity-100 ml-0.5 transition-opacity"
                onClick={() => onRemove(type, tag)}
                disabled={isRemoving === tag}
                title={`Remove "${tag}" from ${label} options`}
              >
                {isRemoving === tag ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminTaxonomy() {
  const utils = trpc.useUtils();
  const [addingType, setAddingType] = useState<TaxonomyType | null>(null);
  const [removingTag, setRemovingTag] = useState<{ type: TaxonomyType; value: string } | null>(null);

  const taxonomyQuery = trpc.tracks.getTaxonomy.useQuery();
  const taxonomy = taxonomyQuery.data ?? { genres: [], moods: [], attributes: [] };

  const addMutation = trpc.tracks.addTaxonomyTag.useMutation({
    onSuccess: () => {
      utils.tracks.getTaxonomy.invalidate();
      utils.tracks.filterOptions.invalidate();
      setAddingType(null);
      toast.success("Tag added");
    },
    onError: (err: { message?: string }) => {
      setAddingType(null);
      toast.error(err.message || "Failed to add tag");
    },
  });

  const removeMutation = trpc.tracks.removeTaxonomyTag.useMutation({
    onSuccess: () => {
      utils.tracks.getTaxonomy.invalidate();
      utils.tracks.filterOptions.invalidate();
      setRemovingTag(null);
      toast.success("Tag removed from dropdown options (existing track tags are unchanged)");
    },
    onError: (err: { message?: string }) => {
      setRemovingTag(null);
      toast.error(err.message || "Failed to remove tag");
    },
  });

  function handleAdd(type: TaxonomyType, value: string) {
    setAddingType(type);
    addMutation.mutate({ type, value });
  }

  function handleRemove(type: TaxonomyType, value: string) {
    setRemovingTag({ type, value });
    removeMutation.mutate({ type, value });
  }

  const tagsByType: Record<TaxonomyType, string[]> = {
    genre: taxonomy.genres,
    mood: taxonomy.moods,
    attribute: taxonomy.attributes,
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Taxonomy Editor</h1>
          <p className="text-sm text-muted-foreground">
            Manage the Genre, Mood, and Attribute tags shown in the Browse page dropdowns.
            Removing a tag hides it from the dropdown but does <strong>not</strong> remove it from existing tracks.
          </p>
        </div>

        {taxonomyQuery.isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {SECTIONS.map(s => (
              <TaxonomySection
                key={s.type}
                type={s.type}
                label={s.label}
                color={s.color}
                pillColor={s.pillColor}
                tags={tagsByType[s.type]}
                onAdd={handleAdd}
                onRemove={handleRemove}
                isAdding={addingType === s.type && addMutation.isPending}
                isRemoving={
                  removingTag?.type === s.type && removeMutation.isPending
                    ? removingTag.value
                    : null
                }
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
