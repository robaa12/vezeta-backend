import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class BookLaboratoryVisitDto {
  @IsString()
  @MaxLength(64)
  serviceId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
