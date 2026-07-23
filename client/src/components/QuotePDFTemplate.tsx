import React from 'react';
import { TemplateV12 } from './pdf-templates/TemplateV12';
import { TemplateV6 } from './pdf-templates/TemplateV6';
import { TemplateV7 } from './pdf-templates/TemplateV7';
import { TemplateV8 } from './pdf-templates/TemplateV8';
import { TemplateV9 } from './pdf-templates/TemplateV9';
import { TemplateV10 } from './pdf-templates/TemplateV10';
import { TemplateV11 } from './pdf-templates/TemplateV11';
import { TemplateV13 } from './pdf-templates/TemplateV13';

export interface CustomActivity {
  id: string;
  dayNumber: number;
  name: string;
  price: number;
}

export interface CustomStay {
  id: string;
  name: string;
  type: string;
  stars: number;
  rooms: number;
  nights: number;
}

export interface CustomTransfer {
  id: string;
  vehicleType: string;
  serviceType: string;
  pax: number;
}

export interface QuotePDFProps {
  leadName: string;
  leadDestination: string;
  leadBudget: string;
  leadNotes: string;
  packageName: string;
  packageCategory: string;
  packageDuration: string;
  templateStyle?: string;

  itinerary?: { day_number: number; title: string; description: string }[];
  inclusions?: { category: string; item: string }[];
  exclusions?: { item: string }[];
  activities?: CustomActivity[];
  stays?: CustomStay[];
  transfers?: CustomTransfer[];

  basePrice: number;
  activitiesCost: number;
  discountAmount: number;
  taxAmount: number;
  finalPrice: number;
}

export function money(value: number) {
  return `Rs ${Math.round(value || 0).toLocaleString('en-IN')}`;
}

export const QuotePDFTemplate = (props: QuotePDFProps) => {
  const style = props.templateStyle || 'v12';

  switch (style) {
    case 'v6':
      return <TemplateV6 {...props} />;
    case 'v7':
      return <TemplateV7 {...props} />;
    case 'v8':
      return <TemplateV8 {...props} />;
    case 'v9':
      return <TemplateV9 {...props} />;
    case 'v10':
      return <TemplateV10 {...props} />;
    case 'v11':
      return <TemplateV11 {...props} />;
    case 'v13':
      return <TemplateV13 {...props} />;
    case 'v12':
    default:
      return <TemplateV12 {...props} />;
  }
};
