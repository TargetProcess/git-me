// tslint:disable:no-unused-expression
import * as chai from 'chai'
import * as mocha from 'mocha'
import { parseCommand } from './git'

const expect = chai.expect

describe('parseCommand', () => {
  it('should parse \\ correctly', () => {
    const result = parseCommand(
      'clone -b master -- git@tp.githost.io:staging/configs.git tmp\\git\\read'
    )
    expect(result.length).to.be.equals(6)
    expect(result[5]).to.be.equals('tmp\\git\\read')
  })
  it('should skip several spaces', () => {
    const result = parseCommand(
      'clone -b master    --  git@tp.githost.io:staging/configs.git tmp\\git\\read '
    )
    expect(result.length).to.be.equals(6)
    expect(result[5]).to.be.equals('tmp\\git\\read')
  })
  it('should parse author without spaces', () => {
    const result = parseCommand(
      'commit -m "test one" --author="Pavel Shapel <shapel@targetprocess.com>"'
    )
    expect(result.length).to.be.equals(4)
    expect(result[0]).to.be.equals('commit')
    expect(result[1]).to.be.equals('-m')
    expect(result[2]).to.be.equals('test one')
    expect(result[3]).to.be.equals('--author="Pavel Shapel <shapel@targetprocess.com>"')
  })
  it('should parse author', () => {
    const result = parseCommand(
      'commit -m "test one" --author "Pavel Shapel <shapel@targetprocess.com>"'
    )
    expect(result.length).to.be.equals(5)
    expect(result[0]).to.be.equals('commit')
    expect(result[1]).to.be.equals('-m')
    expect(result[2]).to.be.equals('test one')
    expect(result[3]).to.be.equals('--author')
    expect(result[4]).to.be.equals('Pavel Shapel <shapel@targetprocess.com>')
  })
  it('should parse escaped \\"', () => {
    const result = parseCommand('commit -m "fi\\"d" --author')
    // tslint:disable-next-line:no-console
    console.dir(result)
    expect(result.length).to.be.equals(4)
    expect(result[0]).to.be.equals('commit')
    expect(result[1]).to.be.equals('-m')
    expect(result[2]).to.be.equals('fi"d')
    expect(result[3]).to.be.equals('--author')
  })
  it('should parse \\ as simple text', () => {
    const result = parseCommand('commit -m "fid wrong path dev\\ls\\test" --author')
    // tslint:disable-next-line:no-console
    console.dir(result)
    expect(result.length).to.be.equals(4)
    expect(result[0]).to.be.equals('commit')
    expect(result[1]).to.be.equals('-m')
    expect(result[2]).to.be.equals('fid wrong path dev\\ls\\test')
    expect(result[3]).to.be.equals('--author')
  })
})
