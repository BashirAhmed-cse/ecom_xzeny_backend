import { type ConnectorKind } from "./connectorKind";
export interface ConnectorOut {
    createdAt: Date;
    description: string;
    featureFlags?: string[] | null;
    filterTypes?: string[] | null;
    id: string;
    instructions: string;
    kind: ConnectorKind;
    logo: string;
    name: string;
    orgId: string;
    transformation: string;
    updatedAt: Date;
}
export declare const ConnectorOutSerializer: {
    _fromJsonObject(object: any): ConnectorOut;
    _toJsonObject(self: ConnectorOut): any;
};
