import { useState, useMemo } from 'react';
import { Search, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EquipmentLibraryItem } from '@/lib/equipmentData';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: EquipmentLibraryItem[];
  onAddItem: (item: Omit<EquipmentLibraryItem, 'id'>) => void;
  onUpdateItem: (id: string, updates: Partial<EquipmentLibraryItem>) => void;
  onDeleteItem: (id: string) => void;
}

const cellCls = 'px-2 py-1.5 text-xs';

function PctInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      className="h-7 text-xs w-20 text-right font-mono"
      defaultValue={(value * 100).toFixed(2) + '%'}
      onFocus={e => { e.target.value = String((value * 100).toFixed(2)); e.target.select(); }}
      onBlur={e => {
        const raw = e.target.value.replace(/%/g, '').trim();
        const num = parseFloat(raw);
        const final = isNaN(num) ? 0 : num;
        onChange(final / 100);
        e.target.value = final.toFixed(2) + '%';
      }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

export default function EquipmentLibraryModal({ open, onOpenChange, library, onAddItem, onUpdateItem, onDeleteItem }: Props) {
  const [tab, setTab] = useState<'major' | 'minor'>('major');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filtered = useMemo(() => {
    return library
      .filter(i => i.type === tab)
      .filter(i => categoryFilter === 'all' || i.category === categoryFilter)
      .filter(i => !search || i.item_name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase()));
  }, [library, tab, search, categoryFilter]);

  const categories = useMemo(() => {
    const cats = new Set(library.filter(i => i.type === tab).map(i => i.category));
    return [...cats].sort();
  }, [library, tab]);

  const handleAdd = () => {
    const defaultCat = categories[0] || (tab === 'major' ? 'Vacuums' : 'Minor Equipment');
    onAddItem({
      type: tab,
      category: defaultCat,
      item_name: 'New Item',
      default_unit_cost_ex_gst: 0,
      default_life_years: tab === 'major' ? 5 : 3,
      default_interest_rate: 0,
      active: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Equipment Library</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => { setTab(v as 'major' | 'minor'); setCategoryFilter('all'); setSearch(''); }}>
          <TabsList>
            <TabsTrigger value="major">Major Equipment</TabsTrigger>
            <TabsTrigger value="minor">Minor Equipment</TabsTrigger>
          </TabsList>

          <div className="flex gap-2 my-3">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-8 h-8 text-sm" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleAdd} className="h-8">
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>

          <TabsContent value={tab} className="mt-0 overflow-auto max-h-[55vh]">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/60 border-b border-border">
                  <th className={`${cellCls} text-left font-semibold`}>Category</th>
                  <th className={`${cellCls} text-left font-semibold`}>Item Name</th>
                  <th className={`${cellCls} text-right font-semibold`}>Unit Cost</th>
                  <th className={`${cellCls} text-right font-semibold`}>Life (yrs)</th>
                  <th className={`${cellCls} text-right font-semibold`}>Interest</th>
                  <th className={`${cellCls} text-center font-semibold w-12`}>Active</th>
                  <th className={`${cellCls} w-8`}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => (
                  <tr key={item.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                    <td className={cellCls}>
                      <Input
                        className="h-7 text-xs"
                        defaultValue={item.category}
                        onBlur={e => onUpdateItem(item.id, { category: e.target.value })}
                      />
                    </td>
                    <td className={cellCls}>
                      <Input
                        className="h-7 text-xs"
                        defaultValue={item.item_name}
                        onBlur={e => onUpdateItem(item.id, { item_name: e.target.value })}
                      />
                    </td>
                    <td className={cellCls}>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-7 text-xs w-24 text-right font-mono"
                        defaultValue={item.default_unit_cost_ex_gst}
                        onBlur={e => onUpdateItem(item.id, { default_unit_cost_ex_gst: parseFloat(e.target.value) || 0 })}
                      />
                    </td>
                    <td className={cellCls}>
                      <Input
                        type="number"
                        min={1}
                        className="h-7 text-xs w-16 text-right font-mono"
                        defaultValue={item.default_life_years}
                        onBlur={e => onUpdateItem(item.id, { default_life_years: parseInt(e.target.value) || (tab === 'major' ? 5 : 3) })}
                      />
                    </td>
                    <td className={cellCls}>
                      <PctInput value={item.default_interest_rate} onChange={v => onUpdateItem(item.id, { default_interest_rate: v })} />
                    </td>
                    <td className={`${cellCls} text-center`}>
                      <input
                        type="checkbox"
                        checked={item.active}
                        onChange={e => onUpdateItem(item.id, { active: e.target.checked })}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className={cellCls}>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDeleteItem(item.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">No items found</td></tr>
                )}
              </tbody>
            </table>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
