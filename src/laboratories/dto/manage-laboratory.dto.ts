import {
  IsArray,
  ArrayMinSize,
  ArrayUnique,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import { Transform, Type, type TransformFnParams } from 'class-transformer';

export const LABORATORY_WEEKDAYS = [
  'SATURDAY',
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
] as const;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function transformNullableCoordinate({ value }: TransformFnParams): unknown {
  if (value === null || value === '' || value === 'null') return null;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
}

function transformStringArray({ value }: TransformFnParams): unknown {
  if (value === undefined || Array.isArray(value)) return value;
  return [value];
}

export class LaboratoryServiceDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsString()
  @MaxLength(1000)
  description!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number | null;

  @IsString()
  @MaxLength(100)
  turnaround!: string;

  @IsString()
  @MaxLength(200)
  preparation!: string;

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
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsString() @MaxLength(50) phone!: string;
  @IsString() @MaxLength(160) accreditation!: string;
  @IsString() @MaxLength(160) turnaround!: string;
  @Transform(transformStringArray)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(LABORATORY_WEEKDAYS, { each: true })
  workingDays!: string[];
  @IsString() @Matches(TIME_PATTERN) opensAt!: string;
  @IsString() @Matches(TIME_PATTERN) closesAt!: string;
  @IsString() @MaxLength(30) tone!: string;
  @IsString() @MaxLength(2000) about!: string;
  @Transform(transformStringArray)
  @IsArray() @IsString({ each: true }) @MaxLength(160, { each: true }) facilities!: string[];
}

export class UpdateLaboratoryDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(10) shortName?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(160) area?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @Transform(transformNullableCoordinate) @IsNumber() @Min(-90) @Max(90) latitude?: number | null;
  @IsOptional() @Transform(transformNullableCoordinate) @IsNumber() @Min(-180) @Max(180) longitude?: number | null;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) accreditation?: string;
  @IsOptional() @IsString() @MaxLength(160) turnaround?: string;
  @IsOptional()
  @Transform(transformStringArray)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(LABORATORY_WEEKDAYS, { each: true })
  workingDays?: string[];
  @IsOptional() @IsString() @Matches(TIME_PATTERN) opensAt?: string;
  @IsOptional() @IsString() @Matches(TIME_PATTERN) closesAt?: string;
  @IsOptional() @IsString() @MaxLength(30) tone?: string;
  @IsOptional() @IsString() @MaxLength(2000) about?: string;
  @IsOptional() @Transform(transformStringArray) @IsArray() @IsString({ each: true }) @MaxLength(160, { each: true }) facilities?: string[];
  @IsOptional() @IsIn(['ACTIVE', 'DEACTIVATED']) status?: 'ACTIVE' | 'DEACTIVATED';
}
