import { Request, Response, NextFunction } from 'express';
import { WashBatchStatus } from '@prisma/client';
import { ApiError } from '../utils/apiError';
import * as svc from '../services/uniform-wash-batch.service';

const userId = (req: Request): string | undefined => (req.user as any)?.id;

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const statusParam = req.query.status as string | undefined;
    let status: WashBatchStatus | WashBatchStatus[] | undefined;
    if (statusParam) {
      status = statusParam.split(',') as WashBatchStatus[];
      if (status.length === 1) status = status[0];
    }
    const data = await svc.listBatches({ status });
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const get = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await svc.getBatch(req.params.id);
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { vendor, notes, items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, 'items requis (au moins 1)');
    }
    const data = await svc.createBatch({ vendor, notes, items, createdById: userId(req) });
    res.status(201).json({ message: 'Lot créé', data });
  } catch (error) {
    next(error);
  }
};

export const addItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, 'items requis');
    }
    const data = await svc.addToBatch(req.params.id, items, { createdById: userId(req) });
    res.json({ message: 'Pièces ajoutées', data });
  } catch (error) {
    next(error);
  }
};

export const send = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { vendor, notes } = req.body;
    const data = await svc.markSent(req.params.id, { vendor, notes });
    res.json({ message: 'Lot envoyé au lavage', data });
  } catch (error) {
    next(error);
  }
};

export const ret = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { notes } = req.body;
    const data = await svc.markReturned(req.params.id, { notes });
    res.json({ message: 'Lot marqué revenu', data });
  } catch (error) {
    next(error);
  }
};

export const inspect = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { inspections } = req.body;
    if (!inspections || !Array.isArray(inspections) || inspections.length === 0) {
      throw new ApiError(400, 'inspections requis');
    }
    const data = await svc.inspectBatch(req.params.id, inspections, userId(req));
    res.json({ message: 'Inspection finalisée', data });
  } catch (error) {
    next(error);
  }
};

export const cancel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await svc.cancelBatch(req.params.id, { createdById: userId(req) });
    res.json({ message: 'Lot annulé', data });
  } catch (error) {
    next(error);
  }
};
