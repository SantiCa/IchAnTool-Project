"""Conversor de edad para sondeo 977"""
import pandas as pd
import os
from pandas import DataFrame
from tkinter import filedialog
import tkinter as tk
import config
import numpy as np

"""____window set_____"""
window=tk.Toplevel()
window.title('IchnopaleoCount alfa 1.0')
window.wm_iconbitmap("IconWindow.ico")
window.wm_title("Age Converter alfa 1")
window.attributes("-topmost", True)

L2=tk.Label(window,text="Select archive where depth data which will be age converted are located")
"""______Frame set___"""
Frame1=tk.Frame(window)
Frame2=tk.Frame(window)
Frame3=tk.Frame(window)
Frame4=tk.Frame(window)
Frame1.grid(row= 0, column=0, columnspan=2 )
Frame2.grid(row= 1, column=0 )
Frame3.grid(row= 1, column= 1)
Frame4.grid(row= 2, column= 0, columnspan=2)
"""___Frame 1___"""
L1=tk.Label(Frame1,text="Select archive where age model is located")
L1.grid(row= 0, column=0)
L2=tk.Label(Frame1,text="Select archive where depth data which will be age converted are located")
L2.grid(row= 1, column=0)
PathAgeM=""
PathDepthM=""
def GetfileAgeM():
    global PathAgeM
    global DONE1
    if PathAgeM != "":
        DONE1.destroy()
    PathAgeM=filedialog.askopenfilename(initialdir = config.PathtoWfolder,title = "Select file (xlsx)")
    DONE1=tk.Label(Frame1,text=PathAgeM)
    DONE1.grid(row=0,column=3)
def GetfiledepthM():
    global PathDepthM
    global DONE2
    if PathDepthM != "":
        DONE2.destroy()
    PathDepthM=filedialog.askopenfilename(initialdir = config.PathtoWfolder,title = "Select file")
    DONE2=tk.Label(Frame1,text=PathDepthM)
    DONE2.grid(row=1,column=3)
B1=tk.Button(Frame1,text="get file",command=lambda:GetfileAgeM())
B2=tk.Button(Frame1,text="get file",command=lambda:GetfiledepthM())
B1.grid(row= 0, column=1)
B2.grid(row= 1, column=1)

"""___VARs___"""
ColumnnDepthAgemodel=tk.StringVar()
SheetAgemodel=tk.StringVar()
ColumnAgeAgemodel=tk.StringVar()
SheetDepthM=tk.StringVar()
ColumnDepthDepthM=tk.StringVar()
"""___Frame 2___"""
L3=tk.Label(Frame2,text="Sheet name for Age and depth in AgeModel")
L3.grid(row= 0, column=0)
tk.Entry(Frame2,textvariable=SheetAgemodel).grid(row= 0, column=1)
L4=tk.Label(Frame2,text="Column where age is located in AgeModel")
L4.grid(row= 1, column=0)
tk.Entry(Frame2,textvariable=ColumnAgeAgemodel).grid(row= 1, column=1)
L5=tk.Label(Frame2,text="Column where depth is located in AgeModel")
L5.grid(row= 2, column=0)
tk.Entry(Frame2,textvariable=ColumnnDepthAgemodel).grid(row= 2, column=1)

"""___Frame 3___"""
L6=tk.Label(Frame3,text="Sheet Name for depth in data tu be converted")
L6.grid(row= 0, column=0)
tk.Entry(Frame3,textvariable=SheetDepthM).grid(row= 0, column=1)
L7=tk.Label(Frame3,text="Column where depth is located in depth to be convertedd")
L7.grid(row= 1, column=0)
tk.Entry(Frame3,textvariable=ColumnDepthDepthM).grid(row= 1, column=1)
"""___Frame 4___"""

def CombertAgeModel(AgemodelVars,DepthModelVars,Folders):
    from pprint import pprint
    Dep1=pd.read_excel(Folders[0],sheet_name=AgemodelVars[0],usecols=AgemodelVars[2])
    Age1=pd.read_excel(Folders[0],sheet_name=AgemodelVars[0],usecols=AgemodelVars[1])
    Dep2=pd.read_excel(Folders[1],sheet_name=DepthModelVars[0],usecols=DepthModelVars[1])
    pprint(Age1)
    pprint(Dep1)
    pprint(Dep2)
    Age1=Age1[Age1.columns[0]].to_numpy()
    Dep1=Dep1[Dep1.columns[0]].to_numpy()
    Dep2=Dep2[Dep2.columns[0]].to_numpy()
    for d in Age1:
        pprint(d)
    for d in Dep1:
        pprint(d)
    for d in Dep2:
        pprint(d)
    print(Age1.shape)
    print(Dep1.shape)
    print(Dep2.shape)
    NewAge=list()
    PrevDepI=int(0)
    PostDepI=int(1)
    PrevAgeI=int(0)
    PostAgeI=int(1)
    count=0
####|
    for i in Dep2:
        if i <= Dep2[Dep2.shape[0]-1]:

            while i > Dep1[PostDepI]:
                PrevDepI=PrevDepI+1
                PostDepI=PostDepI+1


            count=count+1
            print("____ "+str(count)+" Iteration______")
            print("Depth = "+str(i))
            print("between "+ str(Dep1[PrevDepI]))
            print("and " + str(Dep1[PostDepI]))
            print("indexes: "+str(PrevDepI)+","+str(PostDepI))
            if i< Dep1[0]:
                A2=Age1[0]
                D2=Dep1[0]
                Age=i*A2/D2
                NewAge.append(Age)
                print("added"+ str(Age))
            else:
                if i<Dep1[PostDepI] and i>Dep1[PrevDepI]:
                     A1=Age1[PrevDepI]
                     A2=Age1[PostDepI]
                     D1=Dep1[PrevDepI]
                     D2=Dep1[PostDepI]
                     Age=A1+((i-D1)*(A2-A1)/(D2-D1))
                     NewAge.append(Age)
                     print("added"+ str(Age))
                else:
                     if i==Dep1[PostDepI]:
                         NewAge.append(Age1[PostDepI])
                         print("added"+ str(Age1[PostDepI]))
                     else:
                        if i==Dep1[PrevDepI]:
                            NewAge.append(Age1[PrevDepI])
                            print("added"+ str(Age1[PrevDepI]))

        else:
            print("end")
    pprint(NewAge)
    pprint(Age)
    df = pd.DataFrame.from_dict({'Depth':Dep2,'Age':NewAge})
    ruta=filedialog.askdirectory(title='Please select a directory to save ')
    df.to_excel(ruta + "/" + "test.xlsx", header=True, index=False)






def ConvertDepthtoAge():
    from pprint import pprint

    AgemodelVars=[SheetAgemodel.get(),ColumnAgeAgemodel.get(),ColumnnDepthAgemodel.get()]
    DepthModelVars=[SheetDepthM.get(),ColumnDepthDepthM.get()]
    Folders=[PathAgeM,PathDepthM]
    CombertAgeModel(AgemodelVars,DepthModelVars,Folders)
    
B3=tk.Button(Frame4,text="go",command=lambda:ConvertDepthtoAge())
B3.grid(row=0)






"Sheet Name for depth in data tu be converted"
"column where age is located in AgeModel"
"Column where depth is located in Age Model"
"Column where depth is located in depth to be converted"
