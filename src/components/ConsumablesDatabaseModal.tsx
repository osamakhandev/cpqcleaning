import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Search } from 'lucide-react';
import { ConsumableItem, CONSUMABLE_CATEGORIES, ConsumableCategory } from '@/lib/consumablesData';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: ConsumableItem[];
  onSave: (items: ConsumableItem[]) => void;
}

export default function ConsumablesDatabaseModal({ open, onOpenChange, library, onSave }: Props) {
  const [items, setItems] = useState<ConsumableItem[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');

  // Sync items from library whenever modal opens
  useEffect(() => {
    if (open) {
      setItems([...library]);
    }
  }, [open, library]);

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filterCat !== 'all' && i.category !== filterCat) return false;
      if (search && !i.itemName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, search, filterCat]);

  const updateItem = (id: string, updates: Partial<ConsumableItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };

  const addItem = () => {
    const cat = filterCat !== 'all' ? filterCat as ConsumableCategory : CONSUMABLE_CATEGORIES[0];
    setItems(prev => [...prev, {
      id: `c-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      itemName: '',
      category: cat,
      unitCostExGst: 0,
      uomPack: '',
      active: true,
    }]);
  };

  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleSave = () => {
    onSave(items);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Consumables Database</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-[200px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CONSUMABLE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={addItem}><Plus className="h-4 w-4 mr-1" />Add Item</Button>
        </div>

        <div className="overflow-auto flex-1 border rounded-md">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/60 border-b">
                <th className="text-left px-2 py-1.5 font-semibold w-[30%]">Item Name</th>
                <th className="text-left px-2 py-1.5 font-semibold w-[18%]">Category</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[12%]">Unit Cost</th>
                <th className="text-left px-2 py-1.5 font-semibold w-[15%]">UOM / Pack</th>
                <th className="text-center px-2 py-1.5 font-semibold w-[8%]">Active</th>
                <th className="px-2 py-1.5 w-[6%]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => (
                <tr key={item.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                  <td className="px-2 py-1">
                    <Input value={item.itemName} onChange={e => updateItem(item.id, { itemName: e.target.value })} className="h-7 text-xs" />
                  </td>
                  <td className="px-2 py-1">
                    <Select value={item.category} onValueChange={v => updateItem(item.id, { category: v as ConsumableCategory })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{CONSUMABLE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1">
                    <Input type="number" step="0.01" min="0" value={item.unitCostExGst} onChange={e => updateItem(item.id, { unitCostExGst: parseFloat(e.target.value) || 0 })} className="h-7 text-xs text-right font-mono" />
                  </td>
                  <td className="px-2 py-1">
                    <Input value={item.uomPack} onChange={e => updateItem(item.id, { uomPack: e.target.value })} className="h-7 text-xs" />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <Switch checked={item.active} onCheckedChange={v => updateItem(item.id, { active: v })} />
                  </td>
                  <td className="px-2 py-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteItem(item.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No items found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
