import { describe, expect, it, jest } from '@jest/globals';
import {
  AdminLaboratoriesController,
  LaboratoriesController,
} from './laboratories.controller.js';
import { LaboratoriesService } from './laboratories.service.js';

const createControllers = () => {
  const service = {
    list: jest.fn(),
    get: jest.fn(),
    listReviews: jest.fn(),
    book: jest.fn(),
    listAdmin: jest.fn(),
    create: jest.fn(),
    getAdmin: jest.fn(),
    update: jest.fn(),
    setStatus: jest.fn(),
    delete: jest.fn(),
    createService: jest.fn(),
    updateService: jest.fn(),
    deleteService: jest.fn(),
  };
  return {
    service,
    publicController: new LaboratoriesController(
      service as unknown as LaboratoriesService,
    ),
    adminController: new AdminLaboratoriesController(
      service as unknown as LaboratoriesService,
    ),
  };
};

describe('LaboratoriesController', () => {
  it('lists public laboratories', () => {
    const { service, publicController } = createControllers();
    const query = { city: 'Cairo' };
    publicController.list(query);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('gets a public laboratory', () => {
    const { service, publicController } = createControllers();
    publicController.get('alpha-diagnostics');
    expect(service.get).toHaveBeenCalledWith('alpha-diagnostics');
  });

  it('lists public laboratory reviews', () => {
    const { service, publicController } = createControllers();
    publicController.listReviews('alpha-diagnostics');
    expect(service.listReviews).toHaveBeenCalledWith('alpha-diagnostics');
  });

  it('books a laboratory reservation for the authenticated user', () => {
    const { service, publicController } = createControllers();
    const dto = { serviceId: 'alpha-cbc', date: '2026-08-03' };
    publicController.book('alpha-diagnostics', dto, { id: 'user-1' } as never);
    expect(service.book).toHaveBeenCalledWith(
      'user-1',
      'alpha-diagnostics',
      dto,
    );
  });
});

describe('AdminLaboratoriesController', () => {
  it('lists laboratories for admins', () => {
    const { service, adminController } = createControllers();
    const query = { search: 'alpha' };
    adminController.list(query);
    expect(service.listAdmin).toHaveBeenCalledWith(query);
  });

  it('creates a laboratory', () => {
    const { service, adminController } = createControllers();
    const dto = { name: 'New Lab' };
    adminController.create(dto as never);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('gets a laboratory', () => {
    const { service, adminController } = createControllers();
    adminController.get('lab-1');
    expect(service.getAdmin).toHaveBeenCalledWith('lab-1');
  });

  it('updates a laboratory', () => {
    const { service, adminController } = createControllers();
    const dto = { city: 'Giza' };
    adminController.update('lab-1', dto);
    expect(service.update).toHaveBeenCalledWith('lab-1', dto);
  });

  it('deactivates a laboratory', () => {
    const { service, adminController } = createControllers();
    adminController.deactivate('lab-1');
    expect(service.setStatus).toHaveBeenCalledWith('lab-1', 'DEACTIVATED');
  });

  it('activates a laboratory', () => {
    const { service, adminController } = createControllers();
    adminController.activate('lab-1');
    expect(service.setStatus).toHaveBeenCalledWith('lab-1', 'ACTIVE');
  });

  it('deletes a laboratory', () => {
    const { service, adminController } = createControllers();
    adminController.delete('lab-1');
    expect(service.delete).toHaveBeenCalledWith('lab-1');
  });

  it('creates a laboratory service', () => {
    const { service, adminController } = createControllers();
    const dto = { name: 'CBC' };
    adminController.createService('lab-1', dto as never);
    expect(service.createService).toHaveBeenCalledWith('lab-1', dto);
  });

  it('updates a laboratory service', () => {
    const { service, adminController } = createControllers();
    const dto = { name: 'Updated CBC' };
    adminController.updateService('lab-1', 'service-1', dto as never);
    expect(service.updateService).toHaveBeenCalledWith(
      'lab-1',
      'service-1',
      dto,
    );
  });

  it('deletes a laboratory service', () => {
    const { service, adminController } = createControllers();
    adminController.deleteService('lab-1', 'service-1');
    expect(service.deleteService).toHaveBeenCalledWith('lab-1', 'service-1');
  });
});
