import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class LaboratoryServiceDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsString()
  @MaxLength(1000)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsString()
  @MaxLength(100)
  turnaround!: string;

  @IsString()
  @MaxLength(200)
  preparation!: string;

  @IsOptional()
  @IsBoolean()
  popular?: boolean;

  @IsOptional()
  @IsIn(['ACTIVE', 'DEACTIVATED'])
  status?: 'ACTIVE' | 'DEACTIVATED';
}

export class CreateLaboratoryDto {
  @IsString() @MaxLength(160) name!: string;
  @IsString() @MaxLength(10) shortName!: string;
  @IsString() @MaxLength(100) city!: string;
  @IsString() @MaxLength(160) area!: string;
  @IsString() @MaxLength(500) address!: string;
  @IsString() @MaxLength(50) phone!: string;
  @IsNumber() @Min(0) @Max(5) rating!: number;
  @IsInt() @Min(0) reviewCount!: number;
  @IsString() @MaxLength(160) accreditation!: string;
  @IsString() @MaxLength(160) turnaround!: string;
  @IsString() @MaxLength(30) tone!: string;
  @IsString() @MaxLength(2000) about!: string;
  @IsArray() @IsString({ each: true }) @MaxLength(160, { each: true }) facilities!: string[];
}

export class UpdateLaboratoryDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(10) shortName?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(160) area?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(5) rating?: number;
  @IsOptional() @IsInt() @Min(0) reviewCount?: number;
  @IsOptional() @IsString() @MaxLength(160) accreditation?: string;
  @IsOptional() @IsString() @MaxLength(160) turnaround?: string;
  @IsOptional() @IsString() @MaxLength(30) tone?: string;
  @IsOptional() @IsString() @MaxLength(2000) about?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(160, { each: true }) facilities?: string[];
  @IsOptional() @IsIn(['ACTIVE', 'DEACTIVATED']) status?: 'ACTIVE' | 'DEACTIVATED';
}
