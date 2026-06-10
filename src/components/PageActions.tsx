import { Printer, FileSpreadsheet, Download, FileText, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PageActionsProps {
  onExportExcel?: () => void;
  onExportCSV?: () => void;
  onPrint?: () => void;
  onExportPDF?: () => void;
  onCopyImage?: () => void;
  onCopyImageWithLogo?: () => void;
  showPrint?: boolean;
  showExcel?: boolean;
  showCSV?: boolean;
  showLandscapePrint?: boolean;
  showExportPDF?: boolean;
  showCopyImage?: boolean;
  showCopyImageWithLogo?: boolean;
}

export function PageActions({
  onExportExcel,
  onExportCSV,
  onPrint,
  onExportPDF,
  onCopyImage,
  onCopyImageWithLogo,
  showPrint = false,
  showExcel = false,
  showCSV = false,
  showLandscapePrint = false,
  showExportPDF = false,
  showCopyImage = false,
  showCopyImageWithLogo = false,
}: PageActionsProps) {
  const handlePrint = (landscape: boolean) => {
    if (onPrint && !landscape) {
      onPrint();
      return;
    }
    const main = document.querySelector('main');
    if (landscape && main) {
      main.classList.add('landscape-print');
    }
    window.print();
    if (landscape && main) {
      main.classList.remove('landscape-print');
    }
  };

  const hasImageDropdown = showCopyImage && showCopyImageWithLogo && onCopyImage && onCopyImageWithLogo;
  const hasImageSingle = showCopyImage && !showCopyImageWithLogo && onCopyImage;

  return (
    <div className="flex items-center gap-2 no-print">
      {hasImageDropdown && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <ImageIcon className="h-4 w-4 mr-2" />
              Copy as Image
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCopyImageWithLogo}>
              With Logo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCopyImage}>
              Without Logo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {hasImageSingle && (
        <Button onClick={onCopyImage} variant="outline" size="sm">
          <ImageIcon className="h-4 w-4 mr-2" />
          Copy as Image
        </Button>
      )}
      {showExcel && onExportExcel && (
        <Button onClick={onExportExcel} variant="outline" size="sm">
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export Excel
        </Button>
      )}
      {showCSV && onExportCSV && (
        <Button onClick={onExportCSV} variant="ghost" size="sm">
          <Download className="h-4 w-4 mr-2" />
          CSV
        </Button>
      )}
      {showPrint && (
        <Button onClick={() => handlePrint(false)} variant="outline" size="sm">
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      )}
      {showExportPDF && (
        <Button onClick={() => onExportPDF?.() ?? onPrint?.() ?? window.print()} variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
      )}
      {showLandscapePrint && (
        <Button onClick={() => handlePrint(true)} variant="ghost" size="sm">
          <Printer className="h-4 w-4 mr-2" />
          Print (Landscape)
        </Button>
      )}
    </div>
  );
}
